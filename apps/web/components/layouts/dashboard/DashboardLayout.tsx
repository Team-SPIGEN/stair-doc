import styles from "./DashboardLayout.module.css";
import { Footer, Header, Sidebar } from "./layout-components";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div
      className={`grid h-screen text-muted-foreground ${styles.dashboardWrapper}`}
    >
      <div className={`hidden h-screen sm:block ${styles.dashboardSidebar}`}>
        <Sidebar />
      </div>
      <div className={`grid min-w-0 overflow-x-hidden ${styles.dashboardMain}`}>
        <div
          className={`sticky top-0 z-50 flex h-16 w-full min-w-0 items-center overflow-visible border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:h-20 sm:px-6 lg:px-8 ${styles.dashboardHeader}`}
        >
          <Header />
        </div>
        <div className={styles.dashboardContent}>
          <div
            className={`flex flex-col px-4 sm:px-6 lg:px-8 ${styles.dashboardContentWrapper}`}
          >
            {children}
          </div>
          <div className="px-4 sm:px-6 lg:px-8">
            <Footer />
          </div>
        </div>
      </div>
    </div>
  );
}
