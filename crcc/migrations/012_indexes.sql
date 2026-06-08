-- 012_indexes.sql
-- Performance indexes for the canonical schema.
-- tenant_id is included in most composite indexes to support tenant-scoped queries.
-- Interaction is the densest table; its indexes are the most performance-critical.

-- Party
CREATE INDEX idx_party_tenant ON party(tenant_id);
CREATE INDEX idx_party_type ON party(tenant_id, party_type);
CREATE INDEX idx_party_email ON party(tenant_id, canonical_email) WHERE canonical_email IS NOT NULL;
CREATE INDEX idx_party_name ON party(tenant_id, canonical_name);

-- Party_Relationship
CREATE INDEX idx_party_rel_from ON party_relationship(tenant_id, from_party_id);
CREATE INDEX idx_party_rel_to ON party_relationship(tenant_id, to_party_id);
CREATE INDEX idx_party_rel_type ON party_relationship(tenant_id, relationship_type);
CREATE INDEX idx_party_rel_active ON party_relationship(tenant_id, from_party_id) WHERE ended_at IS NULL;

-- Membership
CREATE INDEX idx_membership_tenant ON membership(tenant_id);
CREATE INDEX idx_membership_party ON membership(tenant_id, party_id);
CREATE INDEX idx_membership_status ON membership(tenant_id, current_status_cache);
CREATE INDEX idx_membership_type_tier ON membership(tenant_id, membership_type, tier);
CREATE INDEX idx_membership_effective ON membership(tenant_id, effective_start, effective_end);

-- State_Event
CREATE INDEX idx_state_event_membership ON state_event(tenant_id, membership_id);
CREATE INDEX idx_state_event_effective ON state_event(membership_id, effective_at DESC);

-- Interaction (densest table — indexes are critical)
CREATE INDEX idx_interaction_tenant ON interaction(tenant_id);
CREATE INDEX idx_interaction_party ON interaction(tenant_id, primary_party_id);
CREATE INDEX idx_interaction_type ON interaction(tenant_id, interaction_type);
CREATE INDEX idx_interaction_occurred ON interaction(tenant_id, occurred_at DESC);
CREATE INDEX idx_interaction_channel ON interaction(tenant_id, channel);
CREATE INDEX idx_interaction_artifact ON interaction(generated_artifact_id) WHERE generated_artifact_id IS NOT NULL;

-- Interaction_Party
CREATE INDEX idx_interaction_party_party ON interaction_party(tenant_id, party_id);

-- Signal
CREATE INDEX idx_signal_tenant ON signal(tenant_id);
CREATE INDEX idx_signal_party ON signal(tenant_id, subject_party_id) WHERE subject_party_id IS NOT NULL;
CREATE INDEX idx_signal_membership ON signal(tenant_id, subject_membership_id) WHERE subject_membership_id IS NOT NULL;
CREATE INDEX idx_signal_status ON signal(tenant_id, status);
CREATE INDEX idx_signal_type ON signal(tenant_id, signal_type);
CREATE INDEX idx_signal_active ON signal(tenant_id, status, expires_at) WHERE status = 'ACTIVE';

-- Decision
CREATE INDEX idx_decision_tenant ON decision(tenant_id);
CREATE INDEX idx_decision_party ON decision(tenant_id, subject_party_id) WHERE subject_party_id IS NOT NULL;
CREATE INDEX idx_decision_membership ON decision(tenant_id, subject_membership_id) WHERE subject_membership_id IS NOT NULL;
CREATE INDEX idx_decision_status ON decision(tenant_id, status);
CREATE INDEX idx_decision_type ON decision(tenant_id, decision_type);
CREATE INDEX idx_decision_decided_at ON decision(tenant_id, decided_at DESC);

-- Outcome
CREATE INDEX idx_outcome_tenant ON outcome(tenant_id);
CREATE INDEX idx_outcome_decision ON outcome(caused_by_decision_id) WHERE caused_by_decision_id IS NOT NULL;
CREATE INDEX idx_outcome_interaction ON outcome(caused_by_interaction_id) WHERE caused_by_interaction_id IS NOT NULL;
CREATE INDEX idx_outcome_artifact ON outcome(caused_by_artifact_id) WHERE caused_by_artifact_id IS NOT NULL;
CREATE INDEX idx_outcome_party ON outcome(tenant_id, subject_party_id) WHERE subject_party_id IS NOT NULL;
CREATE INDEX idx_outcome_type ON outcome(tenant_id, outcome_type);
CREATE INDEX idx_outcome_realized ON outcome(tenant_id, realized_at DESC);

-- Generated_Artifact
CREATE INDEX idx_artifact_tenant ON generated_artifact(tenant_id);
CREATE INDEX idx_artifact_party ON generated_artifact(target_party_id) WHERE target_party_id IS NOT NULL;
CREATE INDEX idx_artifact_status ON generated_artifact(tenant_id, status);
CREATE INDEX idx_artifact_type ON generated_artifact(tenant_id, artifact_type);
CREATE INDEX idx_artifact_dispatched ON generated_artifact(dispatched_as_interaction_id) WHERE dispatched_as_interaction_id IS NOT NULL;
CREATE INDEX idx_artifact_outcome ON generated_artifact(outcome_id) WHERE outcome_id IS NOT NULL;
CREATE INDEX idx_artifact_template ON generated_artifact(tenant_id, prompt_template_id, prompt_template_version);

-- Task
CREATE INDEX idx_task_tenant ON task(tenant_id);
CREATE INDEX idx_task_assigned_party ON task(tenant_id, assigned_to_party_id) WHERE assigned_to_party_id IS NOT NULL;
CREATE INDEX idx_task_assigned_agent ON task(tenant_id, assigned_to_agent_id) WHERE assigned_to_agent_id IS NOT NULL;
CREATE INDEX idx_task_about_party ON task(tenant_id, about_party_id) WHERE about_party_id IS NOT NULL;
CREATE INDEX idx_task_status ON task(tenant_id, status);
CREATE INDEX idx_task_due ON task(tenant_id, due_at) WHERE status IN ('PENDING', 'IN_PROGRESS');
CREATE INDEX idx_task_completed ON task(completed_as_interaction_id) WHERE completed_as_interaction_id IS NOT NULL;

-- Transaction
CREATE INDEX idx_transaction_tenant ON transaction(tenant_id);
CREATE INDEX idx_transaction_party ON transaction(tenant_id, party_id);
CREATE INDEX idx_transaction_membership ON transaction(tenant_id, membership_id) WHERE membership_id IS NOT NULL;
CREATE INDEX idx_transaction_type ON transaction(tenant_id, transaction_type);
CREATE INDEX idx_transaction_date ON transaction(tenant_id, transacted_at DESC);

-- Audit_Log
CREATE INDEX idx_audit_tenant ON audit_log(tenant_id);
CREATE INDEX idx_audit_actor ON audit_log(tenant_id, actor_type, actor_id);
CREATE INDEX idx_audit_table ON audit_log(tenant_id, table_name);
CREATE INDEX idx_audit_timestamp ON audit_log(tenant_id, timestamp DESC);
CREATE INDEX idx_audit_record ON audit_log(record_id) WHERE record_id IS NOT NULL;
