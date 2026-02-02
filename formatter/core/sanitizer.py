"""PII/sensitive data redaction using Presidio + regex patterns.

Presidio uses spaCy en_core_web_lg as NER backend for detecting names
and organizations. Regex patterns handle structured data like dollar
amounts, phone numbers, SSNs, emails, and addresses.
"""

import logging
import re
from dataclasses import dataclass, field

from config import (
    ADDRESS_PATTERN,
    DOLLAR_PATTERN,
    EMAIL_PATTERN,
    PHONE_PATTERN,
    SSN_PATTERN,
)

logger = logging.getLogger(__name__)


@dataclass
class Redaction:
    """A single detected PII item."""

    entity_type: str
    original: str
    start: int
    end: int


@dataclass
class SanitizationResult:
    """Result of sanitization on a text block."""

    original_text: str
    sanitized_text: str
    redactions: list[Redaction] = field(default_factory=list)

    @property
    def redaction_count(self) -> int:
        return len(self.redactions)


class Sanitizer:
    """PII detection and redaction engine."""

    def __init__(
        self,
        use_presidio: bool = True,
        use_regex: bool = True,
        entity_types: list[str] | None = None,
    ):
        self.use_presidio = use_presidio
        self.use_regex = use_regex
        self.entity_types = entity_types or [
            "PERSON",
            "ORGANIZATION",
            "PHONE_NUMBER",
            "EMAIL_ADDRESS",
            "US_SSN",
            "CREDIT_CARD",
            "US_DRIVER_LICENSE",
            "LOCATION",
        ]
        self._analyzer = None
        self._anonymizer = None

    def _init_presidio(self):
        """Lazy-init Presidio analyzer + anonymizer."""
        if self._analyzer is not None:
            return

        try:
            from presidio_analyzer import AnalyzerEngine
            from presidio_anonymizer import AnonymizerEngine

            self._analyzer = AnalyzerEngine()
            self._anonymizer = AnonymizerEngine()
            logger.info("Presidio initialized with spaCy NER backend")
        except Exception as e:
            logger.warning("Presidio init failed: %s — falling back to regex only", e)
            self.use_presidio = False

    def _detect_presidio(self, text: str) -> list[Redaction]:
        """Detect PII using Presidio NER."""
        self._init_presidio()
        if self._analyzer is None:
            return []

        results = self._analyzer.analyze(
            text=text,
            entities=self.entity_types,
            language="en",
        )

        redactions = []
        for result in results:
            redactions.append(
                Redaction(
                    entity_type=result.entity_type,
                    original=text[result.start:result.end],
                    start=result.start,
                    end=result.end,
                )
            )
        return redactions

    def _detect_regex(self, text: str) -> list[Redaction]:
        """Detect structured PII using regex patterns."""
        redactions = []

        patterns = [
            (DOLLAR_PATTERN, "DOLLAR_AMOUNT"),
            (PHONE_PATTERN, "PHONE_NUMBER"),
            (SSN_PATTERN, "US_SSN"),
            (EMAIL_PATTERN, "EMAIL_ADDRESS"),
            (ADDRESS_PATTERN, "ADDRESS"),
        ]

        for pattern, entity_type in patterns:
            for match in re.finditer(pattern, text):
                redactions.append(
                    Redaction(
                        entity_type=entity_type,
                        original=match.group(),
                        start=match.start(),
                        end=match.end(),
                    )
                )

        return redactions

    @staticmethod
    def _merge_redactions(redactions: list[Redaction]) -> list[Redaction]:
        """Merge overlapping redactions, keeping the one with the longer span."""
        if not redactions:
            return []

        # Sort by start position, then by length descending
        sorted_r = sorted(redactions, key=lambda r: (r.start, -(r.end - r.start)))
        merged = [sorted_r[0]]

        for current in sorted_r[1:]:
            prev = merged[-1]
            if current.start < prev.end:
                # Overlapping — keep the longer one
                if (current.end - current.start) > (prev.end - prev.start):
                    merged[-1] = current
            else:
                merged.append(current)

        return merged

    def sanitize(self, text: str) -> SanitizationResult:
        """Full sanitization pipeline.

        1. Run Presidio NER detection (if enabled)
        2. Run regex patterns (if enabled)
        3. Merge overlapping redactions
        4. Apply redactions to produce sanitized text
        """
        all_redactions = []

        if self.use_presidio:
            all_redactions.extend(self._detect_presidio(text))

        if self.use_regex:
            all_redactions.extend(self._detect_regex(text))

        merged = self._merge_redactions(all_redactions)

        # Apply redactions from end to start to preserve positions
        sanitized = text
        for redaction in sorted(merged, key=lambda r: r.start, reverse=True):
            replacement = f"[REDACTED_{redaction.entity_type}]"
            sanitized = (
                sanitized[:redaction.start]
                + replacement
                + sanitized[redaction.end:]
            )

        return SanitizationResult(
            original_text=text,
            sanitized_text=sanitized,
            redactions=merged,
        )

    def preview_redactions(self, text: str) -> list[dict]:
        """Return detected PII without applying redactions (for UI preview)."""
        all_redactions = []

        if self.use_presidio:
            all_redactions.extend(self._detect_presidio(text))

        if self.use_regex:
            all_redactions.extend(self._detect_regex(text))

        merged = self._merge_redactions(all_redactions)

        return [
            {
                "type": r.entity_type,
                "text": r.original,
                "start": r.start,
                "end": r.end,
            }
            for r in merged
        ]
