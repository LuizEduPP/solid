import type { ScoreRubric } from "./stream";
import type { Translator } from "./i18n/index.js";

interface RubricBarsProps {
  rubric: ScoreRubric;
  tr: Translator;
}

export default function RubricBars({ rubric, tr }: RubricBarsProps) {
  const { t } = tr;
  const labels: Array<{ key: keyof ScoreRubric; labelKey: Parameters<typeof t>[0] }> = [
    { key: "direct_evidence", labelKey: "rubricEvidence" },
    { key: "source_diversity", labelKey: "rubricSources" },
    { key: "gap_coverage", labelKey: "rubricGaps" },
    { key: "risk_contradiction", labelKey: "rubricRisks" },
  ];

  return (
    <div className="rubric-bars">
      {labels.map(({ key, labelKey }) => (
        <div key={key} className="rubric-row">
          <span>{t(labelKey)}</span>
          <div className="rubric-track">
            <div
              className="rubric-fill"
              style={{ width: `${(rubric[key] / 25) * 100}%` }}
            />
          </div>
          <span className="rubric-value">{rubric[key]}</span>
        </div>
      ))}
    </div>
  );
}
