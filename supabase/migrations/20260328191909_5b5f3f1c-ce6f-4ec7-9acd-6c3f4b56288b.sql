
-- 1. trips
CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tentative_start_date date,
  tentative_end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. trip_members
CREATE TABLE public.trip_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id)
);

-- 3. invites
CREATE TABLE public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'member',
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  redeemed_at timestamptz,
  redeemed_by uuid REFERENCES auth.users(id)
);

-- 4. polls
CREATE TABLE public.polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('date', 'destination')),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. poll_options
CREATE TABLE public.poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  label text NOT NULL,
  start_date date,
  end_date date,
  sort_order integer NOT NULL DEFAULT 0
);

-- 6. votes
CREATE TABLE public.votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_option_id uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value text NOT NULL,
  UNIQUE (poll_option_id, user_id)
);

-- 7. itinerary_items
CREATE TABLE public.itinerary_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  start_time time,
  title text NOT NULL,
  location_text text,
  notes text,
  status text NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'planned', 'booked', 'confirmed')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8. attachments
CREATE TABLE public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  itinerary_item_id uuid REFERENCES public.itinerary_items(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('flight', 'hotel', 'activity', 'other', 'link')),
  file_path text,
  url text,
  title text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. comments
CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  itinerary_item_id uuid REFERENCES public.itinerary_items(id) ON DELETE CASCADE,
  attachment_id uuid REFERENCES public.attachments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. expenses
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  incurred_on date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 11. expense_splits
CREATE TABLE public.expense_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_amount numeric NOT NULL
);

-- 12. trip_share_tokens
CREATE TABLE public.trip_share_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  revoked_at timestamptz
);

-- Indexes
CREATE INDEX idx_trip_members_trip_id ON public.trip_members(trip_id);
CREATE INDEX idx_trip_members_user_id ON public.trip_members(user_id);
CREATE INDEX idx_itinerary_items_trip_date ON public.itinerary_items(trip_id, day_date);
CREATE INDEX idx_expenses_trip_id ON public.expenses(trip_id);
CREATE INDEX idx_comments_trip_id ON public.comments(trip_id);
CREATE INDEX idx_comments_itinerary_item_id ON public.comments(itinerary_item_id);
CREATE INDEX idx_votes_option_user ON public.votes(poll_option_id, user_id);

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_trip_member(_trip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = _trip_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_trip_admin_or_owner(_trip_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = _trip_id AND user_id = _user_id AND role IN ('owner', 'admin')
  );
$$;

-- Trigger: auto-add trip creator as owner
CREATE OR REPLACE FUNCTION public.auto_add_trip_owner()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.trip_members (trip_id, user_id, role)
  VALUES (NEW.id, auth.uid(), 'owner');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_add_trip_owner
  AFTER INSERT ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.auto_add_trip_owner();
