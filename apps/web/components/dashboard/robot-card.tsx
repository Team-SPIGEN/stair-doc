"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface RobotCardSkeletonProps {
  className?: string;
}

export function RobotCardSkeleton({ className }: RobotCardSkeletonProps) {
  return (
    <Card className={cn("animate-pulse", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted" />
            <div className="space-y-2">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-3 w-20 bg-muted rounded" />
            </div>
          </div>
          <div className="h-6 w-16 bg-muted rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between">
          <div className="h-4 w-16 bg-muted rounded" />
          <div className="h-4 w-20 bg-muted rounded" />
        </div>
        <div className="flex justify-between">
          <div className="h-4 w-16 bg-muted rounded" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
        <div className="flex justify-between pt-2 border-t">
          <div className="h-8 w-12 bg-muted rounded" />
          <div className="h-8 w-12 bg-muted rounded" />
          <div className="h-8 w-8 bg-muted rounded" />
        </div>
      </CardContent>
    </Card>
  );
}
