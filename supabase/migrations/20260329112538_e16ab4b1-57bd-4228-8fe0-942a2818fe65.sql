DELETE FROM itinerary_items
WHERE trip_id = '9fb9d3fc-9a96-4c73-a46e-588fb0e3d522'
  AND notes IS NULL
  AND status = 'idea'
  AND sort_order = 0
  AND title IN (SELECT destination FROM trip_route_stops WHERE trip_id = '9fb9d3fc-9a96-4c73-a46e-588fb0e3d522');