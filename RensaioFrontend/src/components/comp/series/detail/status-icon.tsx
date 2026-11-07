import { Download, CheckCircle, AlertTriangle, Clock, Calendar } from "lucide-react";
import { QueueStatus } from "@/lib/api/types";

// Helper function to get status icon
export const getStatusIcon = (status: QueueStatus, isScheduledForFuture?: boolean) => {
  // Special case for future scheduled downloads
  if (isScheduledForFuture) {
    return <Calendar className="h-4 w-4 text-warn" />;
  }

  switch (status) {
    case QueueStatus.RUNNING:
      return <Download className="h-4 w-4 text-info motion-safe:animate-pulse" />;
    case QueueStatus.COMPLETED:
      return <CheckCircle className="h-4 w-4 text-ok" />;
    case QueueStatus.FAILED:
      return <AlertTriangle className="h-4 w-4 text-bad" />;
    case QueueStatus.WAITING:
      return <Clock className="h-4 w-4 text-warn" />;
    default:
      return <Clock className="h-4 w-4 text-ink-3" />;
  }
};
