## AI Assistant Process Overview

### Data & Features
- Sources: PostgreSQL tables (`products`, `inventory`, `sales`, `sale_items`), curated CSV medicine datasets in `datasets_clean/`, synonym mappings in `backend/config/ai_synonyms.json`, and cached MedlinePlus lookups.
- Features extracted: brand/generic names, categories, symptoms, inventory counts, locations, price bands, historical demand, synonym/keyword expansions, semantic embeddings (Sentence-BERT + TF-IDF vectors), conversational context signals (sentiment, last intent, follow-up flags).
- `EnhancedAIService.load_database_data()` hydrates an in-memory catalog refreshed every 5 minutes to keep latency low.

### Model Chosen & Reason
- Layered hybrid stack: pattern-based intent classifier (`AITrainingService`), entity extraction + synonym resolver, multi-strategy retriever (exact, fuzzy, semantic, keyword), and conversational response composer (ConversationalAI / AdvancedConversationalAI / UltraAdvancedAI).
- Chosen to balance deterministic control (regulatory-safe answers) with semantic flexibility; avoids large-model latency/cost while giving pharmacy-specific accuracy.

### Advantages
- Multi-strategy fallback ensures graceful degradation (exact → fuzzy → semantic → keyword).
- Cached catalog + embeddings deliver sub-second responses even on hobby-tier infrastructure.
- Confidence scoring + metrics recording enable continuous monitoring and quick synonym/intent updates.

### Data Preprocessing
- Cleans user utterances (lowercasing, stop-word removal, punctuation trimming) before matching.
- Generates synthetic training templates per intent (symptom, stock, location, price) to cover phrasing diversity.
- Normalizes medicine names via synonym map; builds TF-IDF matrices, SBERT embeddings, and fuzzy indexes at startup.

### Model Development / Algorithm Flow
1. Receive user message (`/api/ai` or `/api/ai-enhanced`).
2. Classify intent + extract medicine/entity candidates.
3. Retrieve best-matching products using ranked combination of exact/fuzzy/semantic scores.
4. Enrich with inventory, price, safety notes; optionally fetch MedlinePlus data.
5. Compose conversational response with tone, follow-ups, and recommended actions; log metrics.

### Data Split & Cross-Validation
- Intent templates are generated programmatically; validation occurs via offline scenario suites and live metrics (match success, no-match categories, confidence distribution).
- Semantic embedding models pre-trained; local evaluation uses holdout queries per intent type.

### Overfitting / Regularization / Generalization
- Reliance on rule+embedding hybrid reduces overfitting to limited labeled data.
- Synonym list and template variations broaden vocabulary coverage; fuzzy distance thresholds prevent over-confident matches.
- Metrics dashboard highlights drift (spikes in no-match or low confidence) prompting synonym/config updates.

### Intervention Cone
- Metrics + logs flag underperforming intents; pharmacists can update `ai_synonyms.json`, add templates, or tweak thresholds without code changes.
- Support staff can seed new data via scripts (`scripts/seed_ai_metrics.py`, `scripts/retrain_enhanced_ai.py`) to reinforce weak areas.

### Validation & Evaluation
- `ai_metrics.py` tracks latency, match success, failure reasons, confidence buckets, user feedback.
- Automated health checks ensure catalog refreshes succeed and MedlinePlus cache is current; alerts raised when confidence stays low.

### Metrics & Interpretation
- Confidence score (0–1): ≥0.8 high trust, 0.6–0.8 caution, <0.6 needs clarification.
- Match success rate: percentage of queries returning actionable products.
- Intent precision/recall estimated from logged classifications vs manual audits.
- User feedback (thumbs up/down) tied back to specific intents/entities for targeted improvements.

### Model Comparison
- Advanced vs Ultra-Advanced conversational layers can be toggled; selection depends on latency budget and need for multi-turn memory.
- Retrieval methods are ranked per query—logs capture which strategy responded, enabling empirical comparison (e.g., semantic vs fuzzy hit rate) before rollout changes.

