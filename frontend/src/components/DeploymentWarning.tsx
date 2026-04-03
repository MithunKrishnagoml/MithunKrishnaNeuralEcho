import { AlertTriangle, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { APP_BASE_URL } from '@/lib/config';

/**
 * Shows a warning banner when user is accessing the app from a preview deployment
 * instead of the production URL
 */
export function DeploymentWarning() {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isPreviewDeployment, setIsPreviewDeployment] = useState(false);

  useEffect(() => {
    // Check if current URL matches the configured production URL
    const currentOrigin = window.location.origin;
    const productionOrigin = APP_BASE_URL;
    
    // If they don't match, we're on a preview deployment
    if (currentOrigin !== productionOrigin) {
      setIsPreviewDeployment(true);
      console.warn('⚠️ [DEPLOYMENT] Accessing from preview URL:', currentOrigin);
      console.warn('⚠️ [DEPLOYMENT] Production URL:', productionOrigin);
    }
  }, []);

  // Don't show if dismissed or not a preview deployment
  if (isDismissed || !isPreviewDeployment) {
    return null;
  }

  const handleGoToProduction = () => {
    window.location.href = APP_BASE_URL + window.location.pathname + window.location.search;
  };

  return (
    <Alert className="fixed top-0 left-0 right-0 z-50 rounded-none border-x-0 border-t-0 border-b-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
      <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <span className="font-semibold text-yellow-800 dark:text-yellow-400">Preview Deployment</span>
          <span className="text-yellow-700 dark:text-yellow-500 ml-2">
            You're viewing a preview. Shareable links will use the production URL ({APP_BASE_URL}), but for best experience, access the app directly from production.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleGoToProduction}
            className="border-yellow-600 text-yellow-700 hover:bg-yellow-100 dark:border-yellow-500 dark:text-yellow-400 dark:hover:bg-yellow-950/40"
          >
            Go to Production
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsDismissed(true)}
            className="text-yellow-700 hover:bg-yellow-100 dark:text-yellow-400 dark:hover:bg-yellow-950/40"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
