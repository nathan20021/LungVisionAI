import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import CreateMedicalRecord from "../CreateMedicalRecord";
import {
  uploadFile,
  getPredictionAndReport,
  getSegmentationBoxes,
  createRecordForUser,
  createPrescription,
} from "../../../services/api";

jest.mock("../../../services/api", () => ({
  uploadFile: jest.fn(),
  getPredictionAndReport: jest.fn(),
  getSegmentationBoxes: jest.fn(),
  createRecordForUser: jest.fn(),
  createPrescription: jest.fn(),
  getMedicalRecord: jest.fn(),
  updateMedicalRecord: jest.fn(),
  updatePrescription: jest.fn(),
  deletePrescription: jest.fn(),
}));
jest.mock("../../../services/dicom", () => ({ dicomToJpeg: jest.fn() }));
jest.mock("../../../context/Authentication", () => ({
  useAuth: () => ({ token: "token", user: { id: "doc-1" } }),
}));

const XRAY_URL = "https://bucket/chest.png";
const prediction = {
  report: { findings: "Patchy airspace opacity", impression: "Right lower zone consolidation" },
  predictions: [
    {
      region: "right lower lung zone",
      conditions: [{ condition: "consolidation", confidence: 74.2 }],
    },
  ],
};

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = () => {};
});

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  uploadFile.mockResolvedValue(XRAY_URL);
  getSegmentationBoxes.mockResolvedValue([]);
});

const renderFlow = (onCreated = () => {}) =>
  render(<CreateMedicalRecord patient={{ id: "p1" }} onCancel={() => {}} onCreated={onCreated} />);

const uploadXRay = () =>
  fireEvent.change(screen.getByLabelText("Browse files"), {
    target: { files: [new File(["x"], "chest.png", { type: "image/png" })] },
  });

test("the analysis starts on upload, and an early Continue waits for it", async () => {
  let finishPrediction;
  getPredictionAndReport.mockReturnValue(new Promise((resolve) => (finishPrediction = resolve)));
  renderFlow();

  expect(screen.getByText("Continue to analysis").closest("button")).toBeDisabled();
  uploadXRay();
  await waitFor(() =>
    expect(getPredictionAndReport).toHaveBeenCalledWith("p1", XRAY_URL, "token")
  );
  expect(getSegmentationBoxes).toHaveBeenCalledWith("doc-1", XRAY_URL, "token");
  expect(screen.getByText(/Analyzing ·/)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Clinical notes"), { target: { value: "Cough for 9 days" } });
  fireEvent.click(screen.getByText("Continue to analysis"));
  expect(screen.getByText("Waiting for analysis…")).toBeInTheDocument();

  await act(async () => finishPrediction(prediction));

  // step 2 is the record view itself, before the record is saved
  expect(await screen.findByText("New record")).toBeInTheDocument();
  expect(screen.getByText("Right lower zone consolidation")).toBeInTheDocument();
  expect(screen.getByText("Cough for 9 days")).toBeInTheDocument();
  expect(screen.getByText("1 of 1 regions flagged")).toBeInTheDocument();
});

test("saving creates the record and its prescriptions in one request", async () => {
  getPredictionAndReport.mockResolvedValue(prediction);
  createRecordForUser.mockResolvedValue({ id: "rec-1" });
  const onCreated = jest.fn();
  renderFlow(onCreated);

  uploadXRay();
  expect(await screen.findByText("Ready to review")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Add prescription"));
  fireEvent.change(screen.getByLabelText("Dosage, prescription 1"), {
    target: { value: "Amoxicillin 1 g" },
  });
  fireEvent.click(screen.getByText("Continue to analysis"));
  fireEvent.click(await screen.findByText("Save record"));

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "rec-1" }));
  expect(createRecordForUser).toHaveBeenCalledWith(
    "p1",
    expect.objectContaining({
      xRayUrl: XRAY_URL,
      report: expect.objectContaining({ impression: "Right lower zone consolidation" }),
      prescriptions: { data: [expect.objectContaining({ dosage: "Amoxicillin 1 g" })] },
    }),
    "token"
  );
  expect(createPrescription).not.toHaveBeenCalled();
});

test("a failed save stays on the review, and Back is locked while saving", async () => {
  getPredictionAndReport.mockResolvedValue(prediction);
  let failSave;
  createRecordForUser.mockReturnValue(new Promise((_, reject) => (failSave = reject)));
  const onCreated = jest.fn();
  renderFlow(onCreated);

  uploadXRay();
  await screen.findByText("Ready to review");
  fireEvent.click(screen.getByText("Continue to analysis"));
  fireEvent.click(await screen.findByText("Save record"));
  expect(screen.getByLabelText("Back to record details")).toBeDisabled();

  await act(async () => failSave(new Error("offline")));

  expect(screen.getByRole("alert")).toHaveTextContent("The record could not be saved");
  expect(screen.getByLabelText("Back to record details")).toBeEnabled();
  expect(onCreated).not.toHaveBeenCalled();
});

test("Cancel asks before discarding what was entered", () => {
  const onCancel = jest.fn();
  render(<CreateMedicalRecord patient={{ id: "p1" }} onCancel={onCancel} onCreated={() => {}} />);
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);

  fireEvent.click(screen.getByText("Cancel"));
  expect(confirm).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);

  fireEvent.change(screen.getByLabelText("Clinical notes"), { target: { value: "Cough" } });
  fireEvent.click(screen.getByText("Cancel"));
  expect(confirm).toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);
  confirm.mockRestore();
});

test("a failed analysis can be retried from step 1", async () => {
  getPredictionAndReport.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(prediction);
  renderFlow();

  uploadXRay();
  expect(await screen.findByText("Analysis failed")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Try again"));
  expect(await screen.findByText("Ready to review")).toBeInTheDocument();
  expect(getPredictionAndReport).toHaveBeenCalledTimes(2);
});
