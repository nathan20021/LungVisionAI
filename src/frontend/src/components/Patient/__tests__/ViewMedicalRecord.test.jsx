import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import ViewMedicalRecord from "../ViewMedicalRecord";
import PatientOverview from "../PatientOverview";
import {
  getMedicalRecord,
  updateMedicalRecord,
  createPrescription,
  updatePrescription,
  deletePrescription,
  getMedications,
} from "../../../services/api";

jest.mock("../../../services/api", () => ({
  getMedicalRecord: jest.fn(),
  updateMedicalRecord: jest.fn(),
  createPrescription: jest.fn(),
  updatePrescription: jest.fn(),
  deletePrescription: jest.fn(),
  getMedications: jest.fn(),
}));
jest.mock("../../../context/Authentication", () => ({
  useAuth: () => ({ token: "token" }),
}));

const record = {
  id: "7f3a91c2-0000",
  priority: "High",
  note: "Cough for 5 days",
  treatmentPlan: "",
  xRayUrl: "",
  created_at: "2026-10-09T10:00:00Z",
  updated_at: "2026-10-10T10:00:00Z",
  report: {
    impression: "Cardiomegaly",
    findings: "",
    segmentationBoxes: [],
    predictions: [
      {
        region: "left upper lung zone",
        conditions: [{ condition: "lung opacity", confidence: 12.4 }],
      },
      {
        region: "right upper lung zone",
        conditions: [
          { condition: "fluid overload/heart failure", confidence: 51 },
          { condition: "enlarged cardiac silhouette", confidence: 75 },
          { condition: "pneumothorax", confidence: 3 },
        ],
      },
    ],
  },
  prescriptions: {
    data: [
      {
        id: "rx-1",
        medicationId: "med-amox",
        medication: "Amoxicillin",
        dosage: "1 g",
        dosageFrequency: "3x daily",
        time: "",
        dosageDuration: "7 days",
      },
    ],
  },
};

const renderRecord = () =>
  render(<ViewMedicalRecord userId="p1" recordId={record.id} onBack={() => {}} />);

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  getMedicalRecord.mockResolvedValue(record);
  getMedications.mockResolvedValue([
    { id: "med-amox", name: "Amoxicillin", category: "Antibiotics" },
    { id: "med-azi", name: "Azithromycin", category: "Antibiotics" },
    { id: "med-furo", name: "Furosemide (Lasix)", category: "Diuretics" },
  ]);
});

// picks a medication once the list has loaded into the drop-down
const chooseMedication = async (row, name) => {
  const select = screen.getByLabelText(`Medication, prescription ${row}`);
  await within(select).findByText(name);
  fireEvent.change(select, { target: { value: within(select).getByText(name).value } });
};

test("view shows the whole record on one page, with empty fields called out", async () => {
  renderRecord();

  expect(await screen.findByText("RID-7f3a91c2")).toBeInTheDocument();
  expect(screen.getByText("High priority")).toBeInTheDocument();
  expect(screen.getByText("Cough for 5 days")).toBeInTheDocument();
  expect(screen.getByText("No treatment plan.")).toBeInTheDocument();
  expect(screen.getByText("No X-ray attached to this record")).toBeInTheDocument();
  expect(screen.getByText(/AI-generated report/)).toBeInTheDocument();
});

test("regions with a condition at or above 50% are flagged, without numbers on the tabs", async () => {
  renderRecord();

  const flagged = await screen.findByRole("button", { name: /right upper lung zone/i });
  const clear = screen.getByRole("button", { name: /left upper lung zone/i });
  expect(flagged).toHaveTextContent("enlarged cardiac silhouette, fluid overload/heart failure");
  expect(clear).toHaveTextContent("Nothing flagged");
  expect(flagged).not.toHaveTextContent("%");
  expect(screen.getByText("1 of 2 regions flagged")).toBeInTheDocument();

  // the first flagged region opens by default, with both conditions marked
  expect(flagged).toHaveAttribute("aria-pressed", "true");
  expect(screen.getAllByText("(flagged)")).toHaveLength(2);

  fireEvent.change(screen.getByLabelText("Alert threshold"), { target: { value: "60" } });
  expect(screen.getAllByText("(flagged)")).toHaveLength(1);
  expect(window.localStorage.getItem("lungvision.alertThreshold")).toBe("60");
});

test("editing saves the record fields and the prescription changes", async () => {
  updateMedicalRecord.mockResolvedValue({});
  createPrescription.mockResolvedValue({ id: "rx-2" });
  deletePrescription.mockResolvedValue({});
  renderRecord();

  fireEvent.click(await screen.findByText("Edit record"));
  fireEvent.change(screen.getByLabelText("Clinical notes"), { target: { value: "Better today" } });
  fireEvent.change(screen.getByLabelText("Impression"), { target: { value: "Edited impression" } });
  fireEvent.click(screen.getByLabelText("Remove prescription 1"));
  fireEvent.click(screen.getByText("Add prescription"));
  await chooseMedication(1, "Azithromycin");
  fireEvent.change(screen.getByLabelText("Dosage, prescription 1"), { target: { value: "500 mg" } });
  fireEvent.click(screen.getByText("Save changes"));

  await waitFor(() => expect(screen.getByText("Edit record")).toBeInTheDocument());
  expect(updateMedicalRecord).toHaveBeenCalledWith(
    "p1",
    record.id,
    expect.objectContaining({
      note: "Better today",
      priority: "High",
      report: expect.objectContaining({ impression: "Edited impression", predictions: record.report.predictions }),
    }),
    "token"
  );
  expect(deletePrescription).toHaveBeenCalledWith("p1", record.id, "rx-1", "token");
  expect(createPrescription).toHaveBeenCalledWith(
    "p1",
    record.id,
    expect.objectContaining({ medicationId: "med-azi", dosage: "500 mg", dosageFrequency: "Once per week" }),
    "token"
  );
  expect(updatePrescription).not.toHaveBeenCalled();
  expect(getMedicalRecord).toHaveBeenCalledTimes(2);
});

test("a prescription without a dosage is not saved", async () => {
  renderRecord();

  fireEvent.click(await screen.findByText("Edit record"));
  fireEvent.change(screen.getByLabelText("Dosage, prescription 1"), { target: { value: " " } });
  fireEvent.click(screen.getByText("Save changes"));

  expect(within(screen.getByRole("alert")).getByText("Each prescription needs a dosage.")).toBeInTheDocument();
  expect(updateMedicalRecord).not.toHaveBeenCalled();
});

test("medications are grouped by category and a new prescription needs one", async () => {
  renderRecord();

  expect(await screen.findByText("Amoxicillin")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Edit record"));
  fireEvent.click(screen.getByText("Add prescription"));
  const select = screen.getByLabelText("Medication, prescription 2");
  await within(select).findByText("Furosemide (Lasix)");
  expect(
    [...select.querySelectorAll("optgroup")].map((group) => group.label)
  ).toEqual(["Antibiotics", "Diuretics"]);
  expect(screen.getByLabelText("Frequency, prescription 2")).toHaveValue("Once per week");

  // an untouched new row is dropped, one with a dosage but no medication is refused
  fireEvent.change(screen.getByLabelText("Dosage, prescription 2"), { target: { value: "40 mg" } });
  fireEvent.click(screen.getByText("Save changes"));

  expect(screen.getByRole("alert")).toHaveTextContent("Choose a medication for each new prescription.");
  expect(updateMedicalRecord).not.toHaveBeenCalled();
});

test("a failed save keeps the edits and the id of rows already created", async () => {
  updateMedicalRecord.mockResolvedValue({});
  deletePrescription.mockRejectedValue(new Error("offline"));
  createPrescription.mockResolvedValue({ id: "rx-2" });
  renderRecord();

  fireEvent.click(await screen.findByText("Edit record"));
  fireEvent.click(screen.getByLabelText("Remove prescription 1"));
  fireEvent.click(screen.getByText("Add prescription"));
  await chooseMedication(1, "Azithromycin");
  fireEvent.change(screen.getByLabelText("Dosage, prescription 1"), { target: { value: "500 mg" } });
  fireEvent.click(screen.getByText("Save changes"));

  expect(await screen.findByRole("alert")).toHaveTextContent("Some changes could not be saved");
  fireEvent.click(screen.getByText("Save changes"));
  await waitFor(() => expect(updatePrescription).toHaveBeenCalledWith("p1", record.id, "rx-2", expect.anything(), "token"));
  expect(createPrescription).toHaveBeenCalledTimes(1);
});

test("a record whose region names were corrected says so", async () => {
  getMedicalRecord.mockResolvedValue({
    ...record,
    report: { ...record.report, regionNamesCorrected: true },
  });
  renderRecord();

  expect(
    await screen.findByText(/Region names on this record were corrected after it was saved/)
  ).toBeInTheDocument();
});

test("view offers a retry when the record fails to load", async () => {
  getMedicalRecord.mockRejectedValueOnce(new Error("offline"));
  renderRecord();

  fireEvent.click(await screen.findByText("Try again"));
  expect(await screen.findByText("RID-7f3a91c2")).toBeInTheDocument();
});

test("overview shows an empty state with a create action when there are no records", () => {
  const onCreate = jest.fn();
  render(
    <PatientOverview patient={{ id: "p1", name: "Jordan" }} records={[]} onCreate={onCreate} onView={() => {}} />
  );

  expect(screen.getByText("No medical records yet")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Create first record"));
  expect(onCreate).toHaveBeenCalled();
});
