
DELETE FROM public.trip_templates WHERE slug IN ('peru-cultural-8-days','ottawa-11-days');

INSERT INTO public.trip_templates (slug, destination, country, country_iso, duration_days, default_vibes, default_pace, default_budget_tier, cover_image_url, description, recommended_season, category, chips, display_order)
VALUES
('istanbul-10-days', 'Istanbul', 'Turkey', 'TR', 10,
 ARRAY['Culture','Food','History']::text[], 'balanced', 'mid-range',
 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=1200&q=80&auto=format&fit=crop',
 'Bosphorus crossings, Sultanahmet rooftops and centuries of bazaars.',
 'April–June, September–October', 'Cultural journeys',
 ARRAY['Culture','History','Food']::text[], 30),
('petra-8-days', 'Petra', 'Jordan', 'JO', 8,
 ARRAY['Culture','Adventure','History']::text[], 'balanced', 'mid-range',
 'https://images.unsplash.com/photo-1580834341580-8c17a3a630ca?w=1200&q=80&auto=format&fit=crop',
 'The Treasury through the Siq, Wadi Rum nights and rose-red canyons.',
 'March–May, September–November', 'Cultural journeys',
 ARRAY['Culture','History','Desert']::text[], 50);
