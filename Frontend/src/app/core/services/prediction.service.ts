// =============================================================================
// Prediction service – communicates with the real CardioSight backend.
// =============================================================================

import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import type {
  EcgExtractionResponse,
  EcgInput,
  ExplanationResult,
  PredictionInput,
  PredictionResult,
  TmtExtractionResponse,
  TmtInput,
} from "../models/prediction.model";

import { ApiService } from "./api.service";

@Injectable({
  providedIn: "root",
})
export class PredictionService {
  private readonly api = inject(ApiService);

  /**
   * POST /api/predict
   *
   * Sends the 15 Framingham features with optional ECG & TMT investigations to the Node backend.
   */
  predict(
    input: PredictionInput,
    ecg?: EcgInput | null,
    tmt?: TmtInput | null
  ): Observable<PredictionResult> {
    const payload: PredictionInput & { ecg?: EcgInput | null; tmt?: TmtInput | null } = {
      ...input,
    };
    if (ecg) {
      payload.ecg = ecg;
    }
    if (tmt) {
      payload.tmt = tmt;
    }
    return this.api.post<PredictionResult>("/predict", payload);
  }

  /**
   * GET /api/predict/:id
   *
   * Fetches a previously stored prediction with optional ECG & TMT findings.
   */
  getResult(id: string): Observable<PredictionResult> {
    return this.api.get<PredictionResult>(`/predict/${id}`);
  }

  /**
   * GET /api/predict/:id/explain
   *
   * Fetches genuine SHAP TreeExplainer feature attributions and waterfall steps.
   */
  getExplanation(id: string): Observable<ExplanationResult> {
    return this.api.get<ExplanationResult>(`/predict/${id}/explain`);
  }

  /**
   * POST /api/investigations/parse-ecg
   *
   * Uploads an ECG PDF report for automated clinical parameter extraction.
   */
  parseEcg(file: File): Observable<EcgExtractionResponse> {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return this.api.post<EcgExtractionResponse>("/investigations/parse-ecg", formData);
  }

  /**
   * POST /api/investigations/parse-tmt
   *
   * Uploads a TMT exercise stress PDF report for parameter extraction.
   */
  parseTmt(file: File): Observable<TmtExtractionResponse> {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return this.api.post<TmtExtractionResponse>("/investigations/parse-tmt", formData);
  }
}
