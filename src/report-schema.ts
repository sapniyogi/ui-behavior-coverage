import type { AnalysisReport, CoverageScores, ProjectAnalysisReport } from './core/model';

export const REPORT_SCHEMA_VERSION = '1' as const;
export const TOOL_VERSION = '0.1.0-rc.1' as const;

export type JsonReportType = 'component' | 'project';

export interface VersionedJsonReport<TReport> {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  toolVersion: typeof TOOL_VERSION;
  reportType: JsonReportType;
  summary: CoverageScores;
  report: TReport;
}

export function createAnalysisJsonReport(
  report: AnalysisReport,
): VersionedJsonReport<AnalysisReport> {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    toolVersion: TOOL_VERSION,
    reportType: 'component',
    summary: report.scores,
    report,
  };
}

export function createProjectJsonReport(
  report: ProjectAnalysisReport,
): VersionedJsonReport<ProjectAnalysisReport> {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    toolVersion: TOOL_VERSION,
    reportType: 'project',
    summary: report.scores,
    report,
  };
}
