import type { EpQuestion } from "../types/epV2";

function normalizedChoiceText(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function optionMarkers(stem: string) {
  return [...String(stem || "").matchAll(/(?:^|\n)\s*([A-Z])[).:]\s+/g)].flatMap(
    (marker) =>
      marker.index === undefined
        ? []
        : [{ index: marker.index, label: marker[1], raw: marker[0] }],
  );
}

function embeddedOptionBlock(stem: string, optionValues: string[]) {
  if (optionValues.length < 2) return null;
  const markers = optionMarkers(stem);
  for (let start = markers.length - optionValues.length; start >= 0; start -= 1) {
    const candidate = markers.slice(start, start + optionValues.length);
    const labels = candidate.map((marker) => marker.label);
    if (new Set(labels).size !== labels.length) continue;
    const parsedValues = candidate.map((marker, index) => {
      const valueStart = marker.index + marker.raw.length;
      const valueEnd = candidate[index + 1]?.index ?? stem.length;
      return stem.slice(valueStart, valueEnd).trim();
    });
    if (
      parsedValues.every(
        (value, index) =>
          normalizedChoiceText(value) === normalizedChoiceText(optionValues[index]),
      )
    ) {
      return {
        stem: stem.slice(0, candidate[0].index).trim(),
        labels,
      };
    }
  }
  return null;
}

export function orderedOptionEntries(options: Record<string, string>) {
  return Object.entries(options).sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

export function normalizeQuestionOptions<T extends EpQuestion>(question: T): T {
  const entries = orderedOptionEntries(question.options);
  const block = embeddedOptionBlock(
    question.stem,
    entries.map(([, value]) => value),
  );
  if (!block) return question;

  const recoveredOptions = Object.fromEntries(
    entries.map(([, value], index) => [block.labels[index], value]),
  );
  return {
    ...question,
    stem: block.stem,
    options:
      question.correctAnswer in recoveredOptions
        ? recoveredOptions
        : question.options,
  };
}
