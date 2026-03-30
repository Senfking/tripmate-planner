CREATE INDEX IF NOT EXISTS idx_proposal_date_options_proposal_id ON proposal_date_options(proposal_id);
CREATE INDEX IF NOT EXISTS idx_date_option_votes_date_option_id ON date_option_votes(date_option_id);
CREATE INDEX IF NOT EXISTS idx_proposal_reactions_proposal_id ON proposal_reactions(proposal_id);