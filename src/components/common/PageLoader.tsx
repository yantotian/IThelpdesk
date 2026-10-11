import { Loader2 } from 'lucide-react';

const PageLoader = () => {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
};

export default PageLoader;
