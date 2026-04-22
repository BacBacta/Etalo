import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <main className="flex min-h-full flex-col items-center justify-center px-6 pt-safe pb-safe">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-base text-muted-foreground">
          The page you are looking for does not exist.
        </p>
        <Button variant="outline" onClick={() => navigate("/")}>
          Back home
        </Button>
      </div>
    </main>
  );
}
