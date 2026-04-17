import { useNavigate, useSearchParams } from "react-router-dom";
import { StandaloneTripBuilder } from "@/components/trip-builder/StandaloneTripBuilder";

export default function TripNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialDestination = searchParams.get("initialDestination") ?? undefined;

  return (
    <StandaloneTripBuilder
      onClose={() => navigate("/app/trips")}
      initialDestination={initialDestination}
    />
  );
}
