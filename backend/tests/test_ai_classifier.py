from __future__ import annotations

import asyncio
import json
import unittest
from types import SimpleNamespace

import cv2
import numpy as np

from services.ai_document_classifier import AIDocumentClassifier
from services.document_classifier import DocumentClassificationResult, DocumentClassifierService
from services.pipeline.pipeline_context import PipelineContext
from services.pipeline.stages.classifier_stage import ClassifierStage

PNG = cv2.imencode(".png", np.full((300, 200, 3), 250, np.uint8))[1].tobytes()


class FakeHeuristics(DocumentClassifierService):
    def __init__(self, result: DocumentClassificationResult) -> None:
        self.result = result

    def classify_document(self, image_bytes: bytes) -> DocumentClassificationResult:
        return self.result


class FakeAI:
    def __init__(self, answer: DocumentClassificationResult | None) -> None:
        self.answer, self.calls = answer, 0

    async def classify(self, image_bytes: bytes):
        self.calls += 1
        return self.answer


def medium_receipt():
    return DocumentClassificationResult("receipt", "medium", "default")


def ai(label: str, confidence: str):
    return DocumentClassificationResult(label, confidence, "ai")


def run(stage: ClassifierStage, hint: str | None = None):
    context = PipelineContext(PNG, "a.png", "image/png", document_type_hint=hint)
    result = asyncio.run(stage.classify(context))
    return context, result


class ClassifierStageTests(unittest.TestCase):
    def test_a_confident_model_answer_overrules_the_default_receipt_guess(self):
        fake = FakeAI(ai("invoice", "high"))
        context, result = run(ClassifierStage(FakeHeuristics(medium_receipt()), fake))
        self.assertTrue(result.success)
        self.assertEqual((context.document_type, fake.calls), ("invoice", 1))

    def test_an_unsure_model_does_not_change_the_heuristic_answer(self):
        for answer in (ai("invoice", "medium"), ai("bank_statement", "low"), None):
            with self.subTest(answer):
                context, _ = run(ClassifierStage(FakeHeuristics(medium_receipt()), FakeAI(answer)))
                self.assertEqual(context.document_type, "receipt")

    def test_the_users_choice_never_calls_the_model(self):
        fake = FakeAI(ai("invoice", "high"))
        context, _ = run(ClassifierStage(FakeHeuristics(medium_receipt()), fake), hint="bank_statement")
        self.assertEqual((context.document_type, fake.calls), ("bank_statement", 0))

    def test_a_confident_heuristic_is_not_second_guessed(self):
        fake = FakeAI(ai("invoice", "high"))
        wallet = DocumentClassificationResult("wallet_screenshot", "high", "x")
        context, _ = run(ClassifierStage(FakeHeuristics(wallet), fake))
        self.assertEqual((context.document_type, fake.calls), ("wallet_screenshot", 0))

    def test_without_a_model_it_behaves_as_before(self):
        context, _ = run(ClassifierStage(FakeHeuristics(medium_receipt()), None))
        self.assertEqual(context.document_type, "receipt")


def client_returning(content: str | Exception):
    async def create(**kwargs):
        if isinstance(content, Exception):
            raise content
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])

    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))


class AIClassifierTests(unittest.TestCase):
    def classify(self, content, image=PNG):
        classifier = AIDocumentClassifier()
        classifier._client = client_returning(content)
        return asyncio.run(classifier.classify(image))

    def test_valid_answers_are_returned(self):
        result = self.classify(json.dumps({"document_type": "Bank_Statement", "confidence": "HIGH"}))
        self.assertEqual((result.document_type, result.confidence), ("bank_statement", "high"))

    def test_bad_answers_and_failures_give_none(self):
        for content in (
            json.dumps({"document_type": "passport", "confidence": "high"}),
            json.dumps({"document_type": "invoice", "confidence": "certain"}),
            json.dumps({"document_type": "unknown", "confidence": "high"}),
            "not json",
            RuntimeError("network down"),
        ):
            with self.subTest(content):
                self.assertIsNone(self.classify(content))

    def test_undecodable_image_gives_none_without_calling_the_model(self):
        self.assertIsNone(self.classify(json.dumps({"document_type": "invoice", "confidence": "high"}), image=b"junk"))

    def test_disabled_without_a_key_or_when_switched_off(self):
        import os
        from unittest.mock import patch

        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            self.assertFalse(AIDocumentClassifier().enabled)
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test", "AI_CLASSIFIER": "off"}):
            self.assertFalse(AIDocumentClassifier().enabled)
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test", "AI_CLASSIFIER": "on"}):
            self.assertTrue(AIDocumentClassifier().enabled)


if __name__ == "__main__":
    unittest.main()
