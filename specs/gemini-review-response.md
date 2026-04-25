Hook registry initialized with 0 hook entries
Here is my assessment of the database spec, answering each of your questions.

### Overall Assessment

This is a well-reasoned and solid proposal for a lightweight implementation. It correctly identifies the need for a dedicated log, considers indexing, and defines a logical state machine for the outreach process. My recommendations below are primarily refinements to further improve data model clarity and long-term maintainability, while adhering to the minimal-change approach.

---

### 1. Should we create a new table or reuse existing ones?

**Recommendation:** **Create a new table.** Your proposal to create `influencer_outreach_log` is the correct approach.

**Justification:**

*   **Separation of Concerns:** Influencer outreach and B2B founder outreach are distinct business processes. Mixing their data would complicate the `outreach_drafts` and `outreach_queue` tables, forcing them to handle two different types of entities.
*   **Primary Key Mismatch:** The most significant technical reason is the difference in primary key types (`INTEGER` for `influencer_pipeline` vs. `UUID` for `outreach_*` tables). Forcing them into a single system would require introducing nullable foreign keys for both entity types (`influencer_id` and `contact_id`) and `CHECK` constraints to ensure data integrity. This creates a polymorphic association that is cumbersome to query and maintain.
*   **Schema Clarity:** A dedicated table with a direct, non-nullable foreign key to `influencer_pipeline` is far cleaner, easier to understand, and less prone to bugs.

### 2. Is the `outcome` enum correct?

**Recommendation:** The enum values are excellent and map well to the business process. I suggest one minor change for clarity: **rename the `outcome` column to `status`**.

**Justification:**

*   **Process vs. Result:** The column represents the current stage of an ongoing process, not just a final result. `status` is a more accurate term for values like `drafted`, `sent`, and `in_negotiation`. `outcome` implies a terminal state. This is a minor semantic point, but it improves schema clarity.
*   **State Machine Logic:** The flow you've defined (`drafted` → `sent` → `replied`...) is a logical state machine. The inclusion of `follow_up` as a state is perfectly acceptable; it represents a key point in the workflow where a next action is scheduled. The exit states (`ghosted`, `declined`) are also correctly identified.

### 3. Should we denormalize `last_outreach_at` and `last_outcome`?

**Recommendation:** **Yes, denormalize.** Add `last_outreach_at` and `last_outcome` columns to the `influencer_pipeline` table.

**Justification:**

*   **Read Performance:** The primary use case for this data will be viewing lists of influencers, then sorting or filtering them by who was contacted last or their current status. Computing this on the fly with a subquery or `JOIN LATERAL` for every row in a list view will be inefficient and scale poorly.
*   **UI/UX:** Fast sorting and filtering are critical for a good user experience. Denormalization makes these queries trivial and highly performant (e.g., `SELECT * FROM influencer_pipeline ORDER BY last_outreach_at DESC`).
*   **Write Complexity Trade-off:** While this adds a small amount of complexity to the write path (you must update `influencer_pipeline` whenever `influencer_outreach_log` is changed), this is a worthwhile trade-off. The update logic is simple and should be wrapped in a transaction with the log insert/update to ensure data consistency.

### 4. Is linking `outreach_drafts` via a nullable `influencer_id` correct?

**Recommendation:** **No.** Do not alter `outreach_drafts`. Instead, store draft content directly in `influencer_outreach_log`.

**Justification:**

*   **Avoids Polymorphism:** As mentioned in question 1, altering `outreach_drafts` would mix concerns and create a confusing polymorphic table. It forces a table designed for `contacts` to also accommodate `influencers`.
*   **Self-Contained Model:** The `influencer_outreach_log` table should be self-contained. A log entry with a `status` of `'drafted'` *is* the draft. Storing the content directly makes the model simpler and decouples it entirely from the B2B outreach system.
*   **Minimal Change:** This approach is more minimal as it avoids altering any existing tables. You would only add the new `influencer_outreach_log` table.

**Suggested Change:**
Remove `draft_id` from your proposed table and add fields for the content itself.

```sql
-- In influencer_outreach_log
-- REMOVE: draft_id UUID REFERENCES outreach_drafts(id) ON DELETE SET NULL,
-- ADD:
subject TEXT,
body TEXT,
```

### 5. Any missing fields or gotchas?

**Recommendation:** The table is well-designed for a lightweight start. Here are a few suggested additions for robustness:

1.  **User Accountability:** Change `logged_by` from `TEXT` to a proper foreign key if you have a `users` table (e.g., `logged_by_user_id INTEGER REFERENCES users(id)`). This provides better auditing.
2.  **Payment Tracking:** Add a `paid_at TIMESTAMPTZ` field. The `paid` status is crucial, and knowing *when* the payment occurred is just as important.
3.  **Channel Specificity:** For channels other than email, a generic `channel` field is okay, but you lose the contact information (e.g., the Twitter handle). Consider adding a `channel_contact_details TEXT` field to store the specific username, profile URL, etc.
4.  **State History (Gotcha):** Be aware that by updating the `status` of a single log record, you lose the history of *when* each status change occurred (e.g., "how long were we in negotiation?"). For a lightweight V1, this is an acceptable trade-off. If this history becomes important later, you would need to move to an event-sourcing model where each status change creates a *new* log row, but that is a significant increase in complexity.

### 6. Any improvements for a minimal-change approach?

**Recommendation:** My primary recommendation for a minimal-change approach is the one from question #4: **do not alter `outreach_drafts`**.

By keeping the draft content within the new `influencer_outreach_log` table, you achieve the project's goal with the absolute minimum impact on the existing schema. The entire feature is encapsulated in one new table and (optionally, but recommended) a few new columns on the `influencer_pipeline` table. This isolates the feature, reduces risk, and makes it easier to modify or remove in the future.
