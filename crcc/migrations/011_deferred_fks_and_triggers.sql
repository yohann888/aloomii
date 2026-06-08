-- 011_deferred_fks_and_triggers.sql
-- Add deferred foreign keys that reference tables created in later migrations,
-- and the current_status_cache trigger (Section 8, resolved).

-- ============================================================
-- Deferred FK: state_event.caused_by_decision_id → decision
-- ============================================================
ALTER TABLE state_event
  ADD CONSTRAINT state_event_caused_by_decision_fk
  FOREIGN KEY (caused_by_decision_id) REFERENCES decision(id);

-- ============================================================
-- Deferred FK: signal.acted_upon_by_decision_id → decision
-- ============================================================
ALTER TABLE signal
  ADD CONSTRAINT signal_acted_upon_by_decision_fk
  FOREIGN KEY (acted_upon_by_decision_id) REFERENCES decision(id);

-- ============================================================
-- Deferred FK: decision.subject_outcome_id → outcome
-- ============================================================
ALTER TABLE decision
  ADD CONSTRAINT decision_subject_outcome_fk
  FOREIGN KEY (subject_outcome_id) REFERENCES outcome(id);

-- ============================================================
-- Deferred FK: outcome.caused_by_artifact_id → generated_artifact
-- ============================================================
ALTER TABLE outcome
  ADD CONSTRAINT outcome_caused_by_artifact_fk
  FOREIGN KEY (caused_by_artifact_id) REFERENCES generated_artifact(id);

-- ============================================================
-- Deferred FK: interaction.generated_artifact_id → generated_artifact
-- ============================================================
ALTER TABLE interaction
  ADD CONSTRAINT interaction_generated_artifact_fk
  FOREIGN KEY (generated_artifact_id) REFERENCES generated_artifact(id);

-- ============================================================
-- Trigger: current_status_cache refresh on State_Event insert
-- (Section 8, resolved: trigger-based, NOT materialized view)
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_membership_status_cache()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE membership
  SET current_status_cache = (
        SELECT to_state FROM state_event
        WHERE membership_id = NEW.membership_id
        ORDER BY effective_at DESC
        LIMIT 1
      ),
      updated_at = now(),
      updated_by = NEW.created_by,
      version = version + 1
  WHERE id = NEW.membership_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_refresh_membership_status
  AFTER INSERT ON state_event
  FOR EACH ROW
  EXECUTE FUNCTION refresh_membership_status_cache();
