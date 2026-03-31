import { Plane } from "lucide-react";
import { TabHeroHeader } from "@/components/ui/TabHeroHeader";

const Trips = () => (
  <div className="min-h-[calc(100dvh-10rem)]" style={{ backgroundColor: "#F1F5F9" }}>
    <TabHeroHeader title="Trips" subtitle="Your group trips will appear here" />
    <div className="flex flex-col items-center justify-center pt-20 text-center px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0D9488]/10">
        <Plane className="h-8 w-8 text-[#0D9488]" />
      </div>
      <h2 className="mt-5 text-lg font-bold text-foreground">No trips yet</h2>
      <p className="mt-2 max-w-[260px] text-[15px] leading-relaxed text-muted-foreground">
        Start planning your next adventure!
      </p>
    </div>
  </div>
);

export default Trips;
