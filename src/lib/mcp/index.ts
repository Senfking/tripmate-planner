import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTrips from "./tools/list-trips";
import getTrip from "./tools/get-trip";
import listExpenses from "./tools/list-expenses";
import addExpense from "./tools/add-expense";
import addItineraryItem from "./tools/add-itinerary-item";
import addIdea from "./tools/add-idea";

// Build the OAuth issuer from the project ref (inlined at build time), never
// from SUPABASE_URL — on Lovable Cloud that is a proxy host and token
// verification would fail the RFC 8414 issuer match.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "junto",
  title: "Junto",
  version: "0.1.0",
  instructions:
    "Tools for Junto, a group trip planner. Read the signed-in user's trips, itineraries, ideas and shared expenses, and add new expenses, itinerary items and ideas. Always call list_trips first to resolve a trip id before using the other tools.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listTrips, getTrip, listExpenses, addExpense, addItineraryItem, addIdea],
});
