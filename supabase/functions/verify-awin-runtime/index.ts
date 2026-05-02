const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const publisher = Deno.env.get('AWIN_PUBLISHER_ID') ?? '';
  const merchant = Deno.env.get('AWIN_BOOKING_MID') ?? '';
  return new Response(JSON.stringify({
    AWIN_PUBLISHER_ID: { present: publisher.length > 0, length: publisher.length },
    AWIN_BOOKING_MID: { present: merchant.length > 0, length: merchant.length },
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
