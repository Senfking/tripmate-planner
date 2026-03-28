import { MoreHorizontal } from "lucide-react";

const More = () => (
  <div className="flex flex-col items-center justify-center gap-4 p-8 pt-24 text-center">
    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
      <MoreHorizontal className="h-10 w-10 text-primary" />
    </div>
    <h1 className="text-2xl font-bold text-foreground">More</h1>
    <p className="max-w-sm text-muted-foreground">Settings, profile, and additional options.</p>
  </div>
);

export default More;
