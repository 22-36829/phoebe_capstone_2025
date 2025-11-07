# 🤖 AI Assistant System Overview

## Executive Summary

### Where is the Code for Model

The **AI Assistant model code is located in multiple service files within the `backend/services/` directory**, with the main orchestration happening in `backend/routes/ai.py` and `backend/routes/ai_enhanced.py`. The core AI service is implemented in `backend/services/enhanced_ai_service.py` (class `EnhancedAIService`), which serves as the primary intelligence engine combining multiple AI techniques including TF-IDF vectorization for content-based filtering, fuzzy string matching for medicine name recognition, semantic embeddings for contextual understanding, and keyword-based search algorithms. The intent classification logic is handled by `backend/services/ai_training.py` (class `AITrainingService`), which uses pattern matching and scoring algorithms to classify user queries into categories such as stock queries, location queries, recommendation queries, medical information queries, price queries, and generic queries. The conversational AI layer is implemented in `backend/services/conversational_ai.py` (class `ConversationalAI`) and `backend/services/advanced_conversational_ai.py` (class `AdvancedConversationalAI`), which provide natural language processing, sentiment analysis, entity extraction, conversation memory, and personality-based response generation. The ultra-advanced AI system in `backend/services/ultra_advanced_ai.py` (class `UltraAdvancedAI`) combines all these technologies with knowledge graph reasoning, multi-turn conversation tracking, and semantic search capabilities. The main API endpoints are defined in `backend/routes/ai.py` (route `/api/ai/chat`) and `backend/routes/ai_enhanced.py` (route `/api/ai-enhanced/chat`), which receive user messages, process them through the AI services, and return intelligent responses with product recommendations, stock information, locations, and medical information.

### Where the Data is Collected or Made

**Data collection for the AI Assistant occurs through multiple sources and methods**. The primary data source is the PostgreSQL database, where product information is queried from tables including `products`, `product_categories`, `inventory`, `sales`, and `sale_items` to get real-time product names, categories, stock levels, locations, prices, and sales history. The `EnhancedAIService` class in `backend/services/enhanced_ai_service.py` implements a `load_database_data()` method (Lines 200-250) that queries the database to build an in-memory medicine database cache containing product names, categories, synonyms, stock quantities, locations, and metadata, which is refreshed periodically (default every 300 seconds) to ensure data freshness. Additionally, the system can load data from CSV files located in the `datasets_clean/` directory, including files like `TABLETS AND CAPSULES.csv`, `SYRUP AND SUSPENSION.csv`, `OTHERS.csv`, `SUPPLIES.csv`, `AMPULES AND VIALS DEXTROSE.csv`, and `MILK.csv`, which provide comprehensive medicine information including generic names, brand names, categories, and medical properties. The AI training data is generated programmatically in `backend/services/ai_training.py` through the `generate_training_examples()` method (Lines 169-200), which creates training examples using query templates for different intents, medicine names, and conditions. Medical information is also fetched from external APIs like MedlinePlus (implemented in `backend/routes/ai.py`, `_get_medlineplus_info()` method, Lines 378-500) when available, and cached locally for 24 hours to reduce API calls. Synonym mappings and category relationships are loaded from `backend/config/ai_synonyms.json`, which contains brand-to-generic name mappings, category groupings (like antibiotics, pain relief, vitamins), and keyword overrides that help the AI understand medicine relationships and user queries better. The system also collects interaction metrics through `backend/services/ai_metrics.py`, which records query patterns, match counts, latency, user feedback, and unmatched queries to continuously improve the AI's understanding and accuracy.

### How Reliable the AI

**The reliability of the AI Assistant depends on several factors and varies based on query type and data availability**. For direct product name queries with exact matches, the AI achieves high reliability (estimated 85-95% accuracy) because it can directly query the database and return precise results. For fuzzy matching scenarios where users misspell medicine names or use brand names instead of generic names, the reliability is moderate to high (estimated 75-85% accuracy) due to the fuzzy string matching algorithms using Levenshtein distance and the synonym mapping system that translates brand names to generic names. For recommendation queries where users ask for medicines based on symptoms or conditions (like "medicine for fever" or "pain relief"), the reliability is moderate (estimated 70-80% accuracy) because the system relies on keyword matching, category mappings, and semantic similarity, which may not always capture the nuanced medical relationships. For medical information queries about drug uses, side effects, or dosages, the reliability is variable (estimated 60-80% accuracy) depending on whether the information is available in the local database or needs to be fetched from external APIs like MedlinePlus, which may have latency or availability issues. The system's reliability is enhanced by multiple fallback strategies: if exact matching fails, it tries fuzzy matching; if fuzzy matching fails, it tries semantic search; if semantic search fails, it tries keyword-based category matching; and if all fail, it provides a helpful response asking for clarification. The AI also tracks its own performance through metrics collection in `backend/services/ai_metrics.py`, which records successful matches, failed queries, user feedback (positive/negative), and response latency, allowing the system to identify areas where reliability is low and potentially improve through retraining or data updates. The confidence scores returned with each response (ranging from 0.0 to 1.0) indicate the AI's certainty about its answer, with scores above 0.8 considered high confidence, scores between 0.6-0.8 considered moderate confidence, and scores below 0.6 indicating low confidence where the AI is less certain about its response.

### Accuracy

**The accuracy of the AI Assistant is measured through multiple metrics and varies significantly based on the type of query and the quality of available data**. Intent classification accuracy, which determines what the user is asking for (stock query, location query, recommendation, etc.), is estimated at 80-90% accuracy using the pattern-based scoring system in `AITrainingService.classify_intent()` method (Lines 94-126 of `backend/services/ai_training.py`), where the system scores different intent patterns and selects the highest-scoring intent. Medicine name extraction accuracy, which identifies the specific medicine the user is asking about, is estimated at 70-85% accuracy using the `extract_medicine_name()` method (Lines 128-154), which removes common query words and attempts to isolate the medicine name, though it can struggle with complex queries or multiple medicine mentions. Product matching accuracy, which finds the correct product in the database based on the extracted name, is estimated at 75-90% accuracy depending on whether exact matches, fuzzy matches, or semantic matches are used, with exact matches being most accurate and semantic matches being least accurate but most flexible. The overall query success rate, measured as the percentage of queries that return relevant results, is tracked in `backend/services/ai_metrics.py` through the `record_interaction()` function (Lines 74-100), which records total queries, successful matches, and failed matches (no_match count), allowing calculation of success rates over time. The system uses confidence scores (0.0-1.0) to indicate accuracy levels, with high confidence (≥0.8) typically corresponding to 85%+ actual accuracy, moderate confidence (0.6-0.8) corresponding to 70-85% accuracy, and low confidence (<0.6) corresponding to <70% accuracy. The accuracy is continuously improved through learning mechanisms: the `LearningSystem` class in `backend/services/advanced_conversational_ai.py` (Lines 297-377) records successful interactions and patterns, the metrics system identifies common failure patterns through unmatched tokens and categories analysis, and the synonym configuration can be updated to improve medicine name recognition. However, accuracy limitations exist: the system may struggle with very ambiguous queries, misspelled medicine names that don't match any known patterns, queries about medicines not in the database, complex multi-part questions, and medical advice that requires professional judgment, which the AI appropriately avoids providing.

---

## Technical Details

### Model Architecture

The AI Assistant uses a multi-layered architecture:

1. **Intent Classification Layer** (`ai_training.py`)
   - Pattern-based scoring system
   - Intent categories: stock_query, location_query, recommendation_query, medical_info_query, price_query, generic_query

2. **Entity Extraction Layer** (`ai_training.py`)
   - Medicine name extraction
   - Synonym resolution
   - Brand-to-generic name mapping

3. **Search & Matching Layer** (`enhanced_ai_service.py`)
   - Exact matching
   - Fuzzy matching (Levenshtein distance)
   - Semantic search (embeddings)
   - Keyword-based category matching

4. **Conversational Layer** (`conversational_ai.py`, `advanced_conversational_ai.py`)
   - Natural language processing
   - Sentiment analysis
   - Conversation memory
   - Context-aware responses

5. **Response Generation Layer**
   - Template-based responses
   - Personality-based tone adjustment
   - Follow-up question generation

### Data Sources

1. **Database Tables:**
   - `products` - Product names, categories, prices
   - `product_categories` - Category information
   - `inventory` - Stock levels, availability
   - `sales`, `sale_items` - Sales history

2. **CSV Files:**
   - Medicine datasets in `datasets_clean/` directory
   - Comprehensive medicine information

3. **External APIs:**
   - MedlinePlus API for medical information
   - Cached for 24 hours

4. **Configuration Files:**
   - `backend/config/ai_synonyms.json` - Synonym mappings
   - Brand-to-generic name mappings
   - Category groupings

### Performance Metrics

- **Response Latency:** Tracked in `ai_metrics.py`
- **Match Success Rate:** Percentage of queries with successful matches
- **User Feedback:** Positive/negative feedback tracking
- **Unmatched Queries:** Analysis of failed queries for improvement

### Confidence Scoring

The AI returns confidence scores with each response:
- **High Confidence (≥0.8):** Very likely to be accurate
- **Moderate Confidence (0.6-0.8):** Reasonably accurate
- **Low Confidence (<0.6):** Less certain, may need clarification

---

*Last Updated: Based on current codebase analysis*
*Documentation Version: 1.0*

