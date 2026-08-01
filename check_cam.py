import paramiko

def run_cmd(ssh, cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    return stdout.read().decode().strip() + stderr.read().decode().strip()

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.8.114', username='spigen', password='Spigen5')

print("--- /boot/firmware/config.txt camera settings ---")
print(run_cmd(ssh, "grep -E -i 'camera|start_x' /boot/firmware/config.txt"))

ssh.close()
