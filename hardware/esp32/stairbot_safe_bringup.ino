/*
 * StairBot ESP32 — combined autonomous firmware (NO Bluetooth)
 *
 * Layers:
 *   1) Autonomous nav: micro-ROS /cmd_vel → BTS7960 tracks; /imu (MPU6050 yaw)
 *   2) Object avoidance: front/rear HC-SR04 hard-stop (< OBSTACLE_STOP_CM)
 *   3) Stair / drop detection: down-looking stair L/R ultrasonics + pitch gate
 *      (flat-floor mapping only — this stops at a stair lip / void; climb = Phase 8)
 *   4) Front scene (ENABLE_FRONT_SCENE): sub /stairbot/lidar_fwd_m (Float32 m from Pi)
 *      + front US cm → classifyFrontScene → /stairbot/front_scene (UInt8)
 *      0=UNKNOWN 1=OPEN 2=WALL 3=RISING_STAIR 4=LOW_OBSTACLE
 *      Safety: forward stop on RISING_STAIR or LOW_OBSTACLE only.
 *      WALL uses existing front US < OBSTACLE_STOP_CM only (no long-range scene stop).
 *      UNKNOWN/OPEN never stop from front_scene (missing lidar_fwd must not brick drive).
 *      Debug: /stairbot/front_scene_stop (Bool) when scene caused the stop.
 *      Motor pin map unchanged.
 *
 * VERIFIED WIRING (LOCKED):
 *   RIGHT FWD=GPIO16 REV=GPIO17 EN={23,5}
 *   LEFT  FWD=GPIO13 REV=GPIO19 EN={2,0}   (GPIO0/2 boot pins — motor power OFF when flashing)
 *
 * Build: Board ESP32 Dev Module, PartitionScheme=huge_app
 * Flash: arduino-cli upload -p $(readlink -f /dev/sensors/esp32) --fqbn ...
 */

#include <MPU6050_light.h>
#include <micro_ros_arduino.h>
#include <Wire.h>

#include <rcl/rcl.h>
#include <rcl/error_handling.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>

#include <std_msgs/msg/bool.h>
#include <std_msgs/msg/u_int32.h>
#include <std_msgs/msg/u_int8.h>
#include <std_msgs/msg/int32.h>
#include <std_msgs/msg/float32.h>
#include <geometry_msgs/msg/twist.h>
#include <sensor_msgs/msg/imu.h>

// ===== Feature flags =====
#define ENABLE_ULTRASONIC_SAFETY 1   // front+rear obstacle hard-stop
#define ENABLE_STAIR_DETECT      1   // stair L/R void detect + pitch publish
#define ENABLE_BUMP_SAFETY       0   // bump switches not validated
#define ENABLE_FRONT_SCENE       1   // LiDAR+US classify; stop fwd on stair/low obstacle

// ---------- VERIFIED motor wiring ----------
static const uint8_t R_FWD_PWM = 16, R_REV_PWM = 17, R_EN_A = 23, R_EN_B = 5;
static const uint8_t L_FWD_PWM = 13, L_REV_PWM = 19, L_EN_A = 2,  L_EN_B = 0;

// ---------- Obstacle ultrasonics ----------
static const uint8_t FRONT_TRIG = 32, FRONT_ECHO = 33;
static const uint8_t REAR_TRIG  = 15, REAR_ECHO  = 4;

// ---------- Stair / drop ultrasonics (from hardware merged sketch) ----------
static const uint8_t STAIR_L_TRIG = 27, STAIR_L_ECHO = 26;
static const uint8_t STAIR_R_TRIG = 14, STAIR_R_ECHO = 12;

static const uint8_t BUMP_L = 34, BUMP_R = 35;

// ---------- HX711 Loadcell ----------
#define ENABLE_HX711 1
#if ENABLE_HX711
#include <HX711.h>
static const uint8_t LOADCELL_DOUT = 36, LOADCELL_SCK = 25;
HX711 hx711;
rcl_publisher_t weight_pub;
std_msgs__msg__Float32 weight_msg;
float current_weight_g = 0.0f;
#endif

// ---------- I2C ----------
static const uint8_t I2C_SDA = 21, I2C_SCL = 22;
static const uint8_t PCA9685_ADDR = 0x40, MPU_I2C_ADDR = 0x68;

// ---------- Drive params (cruise restored Plan 2) ----------
static const float WHEEL_SEPARATION = 0.29467f;
static const float MAX_LINEAR  = 0.20f;
static const float MAX_ANGULAR = 0.80f;
static const uint8_t MIN_MOVE_DUTY = 180;
static const uint8_t MAX_DUTY      = 230;
static const unsigned long CMD_TIMEOUT_MS = 500;
static const int OBSTACLE_STOP_CM = 20;
// Down-looking stair sensors: floor is near; void/stair lip reads farther
static const int STAIR_VOID_CM = 25;
static const float PITCH_STAIR_DEG = 20.0f;   // sustained pitch flag (detection only)
static const unsigned long SAFETY_PERIOD_MS = 80;
static const unsigned long IMU_PERIOD_MS = 33;

// ---------- Front scene (US ~10–15 cm height, LiDAR ~30 cm; publish-only) ----------
#if ENABLE_FRONT_SCENE
static const float LIDAR_INF_M = 8.0f;            // no-return / open (matches Pi lidar_fwd)
static const unsigned long LIDAR_STALE_MS = 1000; // treat lidar as missing if older
static const float EQUAL_TOL_M = 0.20f;           // |lidar - us_m| → WALL
static const float STAIR_DELTA_M = 0.40f;         // lidar >= us_m + delta → RISING_STAIR
static const int US_HIT_CM = 80;                  // US "hit" ceiling for LOW_OBSTACLE
enum FrontScene : uint8_t {
  SCENE_UNKNOWN = 0,
  SCENE_OPEN = 1,
  SCENE_WALL = 2,
  SCENE_RISING_STAIR = 3,
  SCENE_LOW_OBSTACLE = 4
};
#endif

// ---------- micro-ROS ----------
enum AgentState { WAITING_AGENT=0, AGENT_AVAILABLE=1, AGENT_CONNECTED=2, AGENT_DISCONNECTED=3 };
AgentState agent_state = WAITING_AGENT;

rcl_publisher_t heartbeat_pub, boot_safe_pub, i2c_status_pub;
rcl_publisher_t range_front_pub, range_rear_pub;
rcl_publisher_t range_stair_l_pub, range_stair_r_pub;
rcl_publisher_t stair_edge_pub, pitch_pub, imu_pub;
#if ENABLE_FRONT_SCENE
rcl_publisher_t front_scene_pub, front_scene_stop_pub;
rcl_subscription_t lidar_fwd_sub;
#endif
rcl_subscription_t cmd_vel_sub;
rcl_timer_t publish_timer;

std_msgs__msg__UInt32 heartbeat_msg;
std_msgs__msg__Bool   boot_safe_msg, stair_edge_msg;
std_msgs__msg__UInt8  i2c_status_msg;
#if ENABLE_FRONT_SCENE
std_msgs__msg__UInt8  front_scene_msg;
std_msgs__msg__Bool   front_scene_stop_msg;
std_msgs__msg__Float32 lidar_fwd_msg;
#endif
std_msgs__msg__Int32  range_front_msg, range_rear_msg, range_stair_l_msg, range_stair_r_msg;
std_msgs__msg__Float32 pitch_msg;
sensor_msgs__msg__Imu imu_msg;
geometry_msgs__msg__Twist cmd_vel_msg;

rclc_executor_t executor;
rclc_support_t support;
rcl_allocator_t allocator;
rcl_node_t node;

MPU6050 mpu(Wire);
bool mpu_ok = false;

bool entities_created = false;
uint8_t i2c_status_value = 0;
uint32_t heartbeat_counter = 0;
uint8_t spin_fail_count = 0;

float target_left = 0.0f, target_right = 0.0f;
unsigned long last_cmd_ms = 0, last_safety_ms = 0, last_imu_ms = 0;
int front_cm = -1, rear_cm = -1, stair_l_cm = -1, stair_r_cm = -1;
float pitch_deg = 0.0f;
bool bump_active = false;
bool stair_edge = false;
uint8_t safety_toggle = 0;
#if ENABLE_FRONT_SCENE
float lidar_fwd_m = LIDAR_INF_M;
unsigned long last_lidar_ms = 0;
uint8_t front_scene = SCENE_UNKNOWN;
bool front_scene_stop = false;
#endif

unsigned long last_ping_ms = 0, last_retry_ms = 0, last_i2c_ms = 0;
const unsigned long PING_INTERVAL_MS = 1000, RETRY_DELAY_MS = 2000;
const unsigned long CONNECTED_PING_INTERVAL_MS = 5000, I2C_RESCAN_MS = 1000;
const uint8_t SPIN_FAIL_THRESHOLD = 5;

#define RCCHECK(fn) { rcl_ret_t rc = fn; if (rc != RCL_RET_OK) { return false; } }
#define RCSOFTCHECK(fn) { rcl_ret_t rc = fn; (void)rc; }

bool i2c_present(uint8_t a){ Wire.beginTransmission(a); return Wire.endTransmission()==0; }
uint8_t scanI2C(){ bool m=i2c_present(MPU_I2C_ADDR), p=i2c_present(PCA9685_ADDR);
  if(m&&p) return 3; if(m) return 1; if(p) return 2; return 0; }
static inline float clampf(float v,float lo,float hi){ return v<lo?lo:(v>hi?hi:v); }

long readUltrasonicCm(uint8_t trig,uint8_t echo){
  digitalWrite(trig,LOW); delayMicroseconds(2);
  digitalWrite(trig,HIGH); delayMicroseconds(10);
  digitalWrite(trig,LOW);
  long dur = pulseIn(echo,HIGH,25000UL);
  if(dur==0) return -1;
  return (long)(dur*0.0343f/2.0f);
}

void stopMotors(){
  analogWrite(R_FWD_PWM,0); analogWrite(R_REV_PWM,0);
  analogWrite(L_FWD_PWM,0); analogWrite(L_REV_PWM,0);
  digitalWrite(R_EN_A,LOW); digitalWrite(R_EN_B,LOW);
  digitalWrite(L_EN_A,LOW); digitalWrite(L_EN_B,LOW);
}

void driveSide(uint8_t fwd,uint8_t rev,uint8_t enA,uint8_t enB,float speed){
  float mag = fabs(speed);
  if(mag < 0.005f){ analogWrite(fwd,0); analogWrite(rev,0);
    digitalWrite(enA,LOW); digitalWrite(enB,LOW); return; }
  float ratio = clampf(mag/(MAX_LINEAR+MAX_ANGULAR*WHEEL_SEPARATION*0.5f),0.0f,1.0f);
  uint8_t duty = (uint8_t)(MIN_MOVE_DUTY + ratio*(MAX_DUTY-MIN_MOVE_DUTY));
  digitalWrite(enA,HIGH); digitalWrite(enB,HIGH);
  if(speed>0){ analogWrite(fwd,duty); analogWrite(rev,0); }
  else       { analogWrite(rev,duty); analogWrite(fwd,0); }
}

void updateStairEdgeFlag(){
  stair_edge = false;
#if ENABLE_STAIR_DETECT
  // Void / stair lip: down-looking sensor sees farther than floor
  bool l_void = (stair_l_cm > STAIR_VOID_CM);
  bool r_void = (stair_r_cm > STAIR_VOID_CM);
  bool pitch_hi = (fabs(pitch_deg) > PITCH_STAIR_DEG);
  stair_edge = l_void || r_void || pitch_hi;
#endif
}

#if ENABLE_FRONT_SCENE
uint8_t classifyFrontScene(int us_cm, float lidar_m){
  // Stale LiDAR → cannot classify
  if(last_lidar_ms == 0 || (millis() - last_lidar_ms) > LIDAR_STALE_MS){
    return SCENE_UNKNOWN;
  }
  const bool us_timeout = (us_cm <= 0);
  const bool lidar_inf = (lidar_m >= LIDAR_INF_M - 0.01f);
  const bool us_hit = (!us_timeout && us_cm < US_HIT_CM);

  if(us_timeout && lidar_inf) return SCENE_OPEN;

  if(us_hit && lidar_inf) return SCENE_LOW_OBSTACLE;

  if(!us_timeout){
    const float us_m = us_cm * 0.01f;
    const float diff = fabsf(lidar_m - us_m);
    if(diff <= EQUAL_TOL_M) return SCENE_WALL;
    if(lidar_m >= us_m + STAIR_DELTA_M) return SCENE_RISING_STAIR;
  }
  return SCENE_UNKNOWN;
}

void lidarFwdCallback(const void* msgin){
  const std_msgs__msg__Float32* m = (const std_msgs__msg__Float32*)msgin;
  lidar_fwd_m = m->data;
  last_lidar_ms = millis();
}
#endif

void applySafetyFilter(){
  float net = target_left + target_right;
#if ENABLE_FRONT_SCENE
  front_scene_stop = false;
#endif
#if ENABLE_BUMP_SAFETY
  if(bump_active){ target_left=0; target_right=0; return; }
#endif
#if ENABLE_ULTRASONIC_SAFETY
  if(front_cm>0 && front_cm<OBSTACLE_STOP_CM && net>0){ target_left=0; target_right=0; }
  if(rear_cm >0 && rear_cm <OBSTACLE_STOP_CM && net<0){ target_left=0; target_right=0; }
#endif
#if ENABLE_STAIR_DETECT
  // Do not drive forward into a detected stair lip / void (flat-floor safety only)
  if(stair_edge && net>0){ target_left=0; target_right=0; }
#endif
#if ENABLE_FRONT_SCENE
  // Stop forward on rising stair / low obstacle only.
  // WALL: rely on front US < OBSTACLE_STOP_CM (no long-range scene stop).
  // OPEN / UNKNOWN: never stop from scene (stale lidar must not brick drive).
  if(net>0 && (front_scene==SCENE_RISING_STAIR || front_scene==SCENE_LOW_OBSTACLE)){
    target_left=0; target_right=0;
    front_scene_stop = true;
  }
  if(entities_created){
    static bool last_pub_stop = false;
    static unsigned long last_fss_ms = 0;
    unsigned long t = millis();
    if(front_scene_stop != last_pub_stop || (t - last_fss_ms >= SAFETY_PERIOD_MS)){
      last_pub_stop = front_scene_stop;
      last_fss_ms = t;
      front_scene_stop_msg.data = front_scene_stop;
      RCSOFTCHECK(rcl_publish(&front_scene_stop_pub,&front_scene_stop_msg,NULL));
    }
  }
#endif
}

void applyDrive(){
  driveSide(R_FWD_PWM,R_REV_PWM,R_EN_A,R_EN_B,target_right);
  driveSide(L_FWD_PWM,L_REV_PWM,L_EN_A,L_EN_B,target_left);
}

void updateSafetySensors(){
  unsigned long now = millis();
  bool due = (now - last_safety_ms >= SAFETY_PERIOD_MS);
  if(due){
    last_safety_ms = now;
#if ENABLE_BUMP_SAFETY
    bump_active = (digitalRead(BUMP_L)==LOW || digitalRead(BUMP_R)==LOW);
#endif

    // Round-robin ultrasonic channels to keep loop responsive
    switch(safety_toggle & 0x03){
#if ENABLE_ULTRASONIC_SAFETY
      case 0: front_cm = readUltrasonicCm(FRONT_TRIG,FRONT_ECHO); break;
      case 1: rear_cm  = readUltrasonicCm(REAR_TRIG, REAR_ECHO);  break;
#else
      case 0: case 1: break;
#endif
#if ENABLE_STAIR_DETECT
      case 2: stair_l_cm = readUltrasonicCm(STAIR_L_TRIG,STAIR_L_ECHO); break;
      case 3: stair_r_cm = readUltrasonicCm(STAIR_R_TRIG,STAIR_R_ECHO); break;
#else
      case 2: case 3: break;
#endif
    }
    safety_toggle++;
#if ENABLE_HX711
    if (hx711.is_ready()) {
      current_weight_g = hx711.get_units(1);
    }
#endif
    updateStairEdgeFlag();
  }

#if ENABLE_FRONT_SCENE
  // Reclassify every call so lidar stale/new msgs apply before applySafetyFilter
  front_scene = classifyFrontScene(front_cm, lidar_fwd_m);
#endif

  if(!entities_created) return;

  if(due){
#if ENABLE_ULTRASONIC_SAFETY
    range_front_msg.data = front_cm; range_rear_msg.data = rear_cm;
    RCSOFTCHECK(rcl_publish(&range_front_pub,&range_front_msg,NULL));
    RCSOFTCHECK(rcl_publish(&range_rear_pub,&range_rear_msg,NULL));
#endif
#if ENABLE_STAIR_DETECT
    range_stair_l_msg.data = stair_l_cm;
    range_stair_r_msg.data = stair_r_cm;
    stair_edge_msg.data = stair_edge;
    pitch_msg.data = pitch_deg;
    RCSOFTCHECK(rcl_publish(&range_stair_l_pub,&range_stair_l_msg,NULL));
    RCSOFTCHECK(rcl_publish(&range_stair_r_pub,&range_stair_r_msg,NULL));
    RCSOFTCHECK(rcl_publish(&stair_edge_pub,&stair_edge_msg,NULL));
    RCSOFTCHECK(rcl_publish(&pitch_pub,&pitch_msg,NULL));
#endif
#if ENABLE_FRONT_SCENE
    front_scene_msg.data = front_scene;
    RCSOFTCHECK(rcl_publish(&front_scene_pub,&front_scene_msg,NULL));
#endif
#if ENABLE_HX711
    weight_msg.data = current_weight_g;
    RCSOFTCHECK(rcl_publish(&weight_pub,&weight_msg,NULL));
#endif
  }
}

void publishImu(){
  if(!mpu_ok) return;
  mpu.update();
  pitch_deg = mpu.getAngleY();
  float yaw   = mpu.getAngleZ() * DEG_TO_RAD;
  imu_msg.orientation.x = 0.0; imu_msg.orientation.y = 0.0;
  imu_msg.orientation.z = sin(yaw*0.5f);
  imu_msg.orientation.w = cos(yaw*0.5f);
  imu_msg.angular_velocity.x = mpu.getGyroX()*DEG_TO_RAD;
  imu_msg.angular_velocity.y = mpu.getGyroY()*DEG_TO_RAD;
  imu_msg.angular_velocity.z = mpu.getGyroZ()*DEG_TO_RAD;
  imu_msg.linear_acceleration.x = mpu.getAccX()*9.81f;
  imu_msg.linear_acceleration.y = mpu.getAccY()*9.81f;
  imu_msg.linear_acceleration.z = mpu.getAccZ()*9.81f;
  imu_msg.orientation_covariance[0]=0.01; imu_msg.orientation_covariance[4]=0.01; imu_msg.orientation_covariance[8]=0.05;
  imu_msg.angular_velocity_covariance[0]=0.01; imu_msg.angular_velocity_covariance[4]=0.01; imu_msg.angular_velocity_covariance[8]=0.01;
  imu_msg.linear_acceleration_covariance[0]=0.1; imu_msg.linear_acceleration_covariance[4]=0.1; imu_msg.linear_acceleration_covariance[8]=0.1;
  RCSOFTCHECK(rcl_publish(&imu_pub,&imu_msg,NULL));
}

void cmdVelCallback(const void* msgin){
  const geometry_msgs__msg__Twist* m = (const geometry_msgs__msg__Twist*)msgin;
  float v = clampf((float)m->linear.x,  -MAX_LINEAR,  MAX_LINEAR);
  float w = clampf((float)m->angular.z, -MAX_ANGULAR, MAX_ANGULAR);
  target_left  = v - w*WHEEL_SEPARATION*0.5f;
  target_right = v + w*WHEEL_SEPARATION*0.5f;
  last_cmd_ms = millis();
}

void initPins(){
  uint8_t outs[] = {R_FWD_PWM,R_REV_PWM,L_FWD_PWM,L_REV_PWM,R_EN_A,R_EN_B,L_EN_A,L_EN_B};
  for(uint8_t i=0;i<8;i++) pinMode(outs[i],OUTPUT);
  pinMode(FRONT_TRIG,OUTPUT); pinMode(REAR_TRIG,OUTPUT);
  pinMode(STAIR_L_TRIG,OUTPUT); pinMode(STAIR_R_TRIG,OUTPUT);
  digitalWrite(FRONT_TRIG,LOW); digitalWrite(REAR_TRIG,LOW);
  digitalWrite(STAIR_L_TRIG,LOW); digitalWrite(STAIR_R_TRIG,LOW);
  pinMode(FRONT_ECHO,INPUT); pinMode(REAR_ECHO,INPUT);
  pinMode(STAIR_L_ECHO,INPUT); pinMode(STAIR_R_ECHO,INPUT);
  pinMode(BUMP_L,INPUT); pinMode(BUMP_R,INPUT);
  stopMotors();
}

void timerCallback(rcl_timer_t* timer,int64_t){
  if(timer==NULL) return;
  heartbeat_counter++;
  heartbeat_msg.data = heartbeat_counter;
  boot_safe_msg.data = true;
  i2c_status_msg.data = i2c_status_value;
  RCSOFTCHECK(rcl_publish(&heartbeat_pub,&heartbeat_msg,NULL));
  RCSOFTCHECK(rcl_publish(&boot_safe_pub,&boot_safe_msg,NULL));
  RCSOFTCHECK(rcl_publish(&i2c_status_pub,&i2c_status_msg,NULL));
}

bool createEntities(){
  allocator = rcl_get_default_allocator();
  RCCHECK(rclc_support_init(&support,0,NULL,&allocator));
  RCCHECK(rclc_node_init_default(&node,"stairbot_esp32","",&support));
  RCCHECK(rclc_publisher_init_default(&heartbeat_pub,&node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs,msg,UInt32),"/stairbot/heartbeat"));
  RCCHECK(rclc_publisher_init_default(&boot_safe_pub,&node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs,msg,Bool),"/stairbot/boot_safe"));
  RCCHECK(rclc_publisher_init_default(&i2c_status_pub,&node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs,msg,UInt8),"/stairbot/i2c_status"));
  RCCHECK(rclc_publisher_init_default(&range_front_pub,&node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs,msg,Int32),"/stairbot/range_front_cm"));
  RCCHECK(rclc_publisher_init_default(&range_rear_pub,&node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs,msg,Int32),"/stairbot/range_rear_cm"));
  RCCHECK(rclc_publisher_init_default(&range_stair_l_pub,&node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs,msg,Int32),"/stairbot/range_stair_left_cm"));
  RCCHECK(rclc_publisher_init_default(&range_stair_r_pub,&node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs,msg,Int32),"/stairbot/range_stair_right_cm"));
  RCCHECK(rclc_publisher_init_default(&stair_edge_pub,&node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs,msg,Bool),"/stairbot/stair_edge"));
  RCCHECK(rclc_publisher_init_default(&pitch_pub,&node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs,msg,Float32),"/stairbot/pitch_deg"));
  RCCHECK(rclc_publisher_init_default(&imu_pub,&node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(sensor_msgs,msg,Imu),"/imu"));
#if ENABLE_HX711
  RCCHECK(rclc_publisher_init_default(&weight_pub,&node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs,msg,Float32),"/stairbot/weight"));
#endif
#if ENABLE_FRONT_SCENE
  RCCHECK(rclc_publisher_init_default(&front_scene_pub,&node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs,msg,UInt8),"/stairbot/front_scene"));
  RCCHECK(rclc_publisher_init_default(&front_scene_stop_pub,&node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs,msg,Bool),"/stairbot/front_scene_stop"));
  RCCHECK(rclc_subscription_init_default(&lidar_fwd_sub,&node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs,msg,Float32),"/stairbot/lidar_fwd_m"));
#endif
  RCCHECK(rclc_subscription_init_default(&cmd_vel_sub,&node,
    ROSIDL_GET_MSG_TYPE_SUPPORT(geometry_msgs,msg,Twist),"/cmd_vel"));
#if ENABLE_FRONT_SCENE
  RCCHECK(rclc_executor_init(&executor,&support.context,3,&allocator));
#else
  RCCHECK(rclc_executor_init(&executor,&support.context,2,&allocator));
#endif
  const unsigned int timer_period_ms = 1000;
  RCCHECK(rclc_timer_init_default(&publish_timer,&support,
    RCL_MS_TO_NS(timer_period_ms),timerCallback));
  RCCHECK(rclc_executor_add_timer(&executor,&publish_timer));
  RCCHECK(rclc_executor_add_subscription(&executor,&cmd_vel_sub,&cmd_vel_msg,
    &cmdVelCallback,ON_NEW_DATA));
#if ENABLE_FRONT_SCENE
  RCCHECK(rclc_executor_add_subscription(&executor,&lidar_fwd_sub,&lidar_fwd_msg,
    &lidarFwdCallback,ON_NEW_DATA));
#endif
  heartbeat_msg.data=0; boot_safe_msg.data=true; i2c_status_msg.data=i2c_status_value;
  range_front_msg.data=-1; range_rear_msg.data=-1;
  range_stair_l_msg.data=-1; range_stair_r_msg.data=-1;
  stair_edge_msg.data=false; pitch_msg.data=0.0f;
#if ENABLE_FRONT_SCENE
  lidar_fwd_m = LIDAR_INF_M; last_lidar_ms = 0;
  front_scene = SCENE_UNKNOWN; front_scene_msg.data = SCENE_UNKNOWN;
  front_scene_stop = false; front_scene_stop_msg.data = false;
  lidar_fwd_msg.data = LIDAR_INF_M;
#endif
  target_left=0; target_right=0; last_cmd_ms=millis();
  return true;
}

void destroyEntities(){
  if(!entities_created) return;
  stopMotors();
  rcl_subscription_fini(&cmd_vel_sub,&node);
#if ENABLE_FRONT_SCENE
  rcl_subscription_fini(&lidar_fwd_sub,&node);
  rcl_publisher_fini(&front_scene_stop_pub,&node);
  rcl_publisher_fini(&front_scene_pub,&node);
#endif
  rcl_timer_fini(&publish_timer);
  rcl_publisher_fini(&heartbeat_pub,&node);
  rcl_publisher_fini(&boot_safe_pub,&node);
  rcl_publisher_fini(&i2c_status_pub,&node);
  rcl_publisher_fini(&range_front_pub,&node);
  rcl_publisher_fini(&range_rear_pub,&node);
  rcl_publisher_fini(&range_stair_l_pub,&node);
  rcl_publisher_fini(&range_stair_r_pub,&node);
  rcl_publisher_fini(&stair_edge_pub,&node);
  rcl_publisher_fini(&pitch_pub,&node);
  rcl_publisher_fini(&imu_pub,&node);
#if ENABLE_HX711
  rcl_publisher_fini(&weight_pub,&node);
#endif
  rclc_executor_fini(&executor);
  rcl_node_fini(&node);
  rclc_support_fini(&support);
  entities_created=false;
}

void setup(){
  initPins(); stopMotors();
#if ENABLE_HX711
  hx711.begin(LOADCELL_DOUT, LOADCELL_SCK);
  hx711.set_scale();
  hx711.tare();
#endif
  Wire.begin(I2C_SDA,I2C_SCL,400000); delay(50);
  i2c_status_value = scanI2C();
  if(mpu.begin()==0){ mpu.calcOffsets(); mpu_ok=true; }
  set_microros_transports();
  delay(2000);
  agent_state=WAITING_AGENT; last_ping_ms=0; last_retry_ms=0; spin_fail_count=0;
  target_left=0; target_right=0;
  stopMotors();
}

void loop(){
  const unsigned long now = millis();
  if(now - last_i2c_ms >= I2C_RESCAN_MS){ last_i2c_ms = now; i2c_status_value = scanI2C(); }

  switch(agent_state){
    case WAITING_AGENT:
      stopMotors();
      if(now - last_ping_ms >= PING_INTERVAL_MS){ last_ping_ms=now;
        if(RMW_RET_OK==rmw_uros_ping_agent(1000,1)) agent_state=AGENT_AVAILABLE; }
      delay(10); break;

    case AGENT_AVAILABLE:
      stopMotors();
      if(createEntities()){ entities_created=true; agent_state=AGENT_CONNECTED;
        spin_fail_count=0; last_ping_ms=now; }
      else { destroyEntities(); agent_state=WAITING_AGENT; last_retry_ms=now; delay(RETRY_DELAY_MS); }
      break;

    case AGENT_CONNECTED:
      if(now - last_cmd_ms > CMD_TIMEOUT_MS){ target_left=0; target_right=0; }
      updateSafetySensors();
      applySafetyFilter();
      applyDrive();
      if(now - last_imu_ms >= IMU_PERIOD_MS){ last_imu_ms=now; publishImu(); }

      if(rclc_executor_spin_some(&executor,RCL_MS_TO_NS(20)) != RCL_RET_OK) spin_fail_count++;
      else spin_fail_count=0;

      if(now - last_ping_ms >= CONNECTED_PING_INTERVAL_MS){ last_ping_ms=now;
        if(RMW_RET_OK != rmw_uros_ping_agent(1000,1)) spin_fail_count=SPIN_FAIL_THRESHOLD; }

      if(spin_fail_count >= SPIN_FAIL_THRESHOLD){ stopMotors(); destroyEntities();
        agent_state=AGENT_DISCONNECTED; last_retry_ms=now; }
      break;

    case AGENT_DISCONNECTED:
      stopMotors(); target_left=0; target_right=0;
      if(now - last_retry_ms >= RETRY_DELAY_MS){ agent_state=WAITING_AGENT; last_ping_ms=0; }
      delay(10); break;
  }
}
