import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  PrescriptionTable,
  completePrescriptions,
  blankPrescription,
  prescriptionError,
} from "../ViewMedicalRecord";
import { getMedications } from "../../../services/api";

jest.mock("../../../services/api", () => ({
  getMedications: jest.fn(),
}));
jest.mock("../../../context/Authentication", () => ({
  useAuth: () => ({ token: "token" }),
}));

const saved = {
  id: "rx-1",
  medicationId: "med-old",
  medication: "Old drug",
  dosage: "1 g",
  dosageFrequency: "Daily",
  time: "",
  dosageDuration: "",
};
const medications = [
  { id: "med-amox", name: "Amoxicillin", category: "Antibiotics" },
  { id: "med-furo", name: "Furosemide (Lasix)", category: "Diuretics" },
];

test("the saved medication stays shown when the list fails, and the list can be retried", async () => {
  getMedications.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(medications);
  const onRowsChange = jest.fn();
  const fresh = blankPrescription();
  render(<PrescriptionTable rows={[saved, fresh]} onRowsChange={onRowsChange} />);

  const savedSelect = screen.getByLabelText("Medication, prescription 1");
  expect(await screen.findByRole("alert")).toHaveTextContent("The medication list could not be loaded.");
  expect(savedSelect).toHaveDisplayValue("Old drug");

  fireEvent.click(screen.getByText("Try again"));
  await within(savedSelect).findByText("Amoxicillin");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(getMedications).toHaveBeenCalledTimes(2);

  // a medication off the list stays selected; a chosen one cannot be unset
  expect(savedSelect).toHaveDisplayValue("Old drug");
  expect(within(savedSelect).queryByText("Select medication")).not.toBeInTheDocument();
  const freshSelect = screen.getByLabelText("Medication, prescription 2");
  expect(freshSelect).toHaveDisplayValue("Select medication");
  expect(screen.getByLabelText("Frequency, prescription 2")).toHaveValue("Once per week");

  fireEvent.change(freshSelect, { target: { value: "med-furo" } });
  expect(onRowsChange).toHaveBeenCalledWith([
    saved,
    { ...fresh, medicationId: "med-furo", medication: "Furosemide (Lasix)" },
  ]);

  fireEvent.click(screen.getByLabelText("Remove prescription 1"));
  expect(onRowsChange).toHaveBeenLastCalledWith([fresh]);
});

test("only unsaved rows with nothing but a frequency are dropped", () => {
  const untouched = blankPrescription();
  const frequencyCleared = { ...blankPrescription(), dosageFrequency: "" };
  const savedButCleared = { ...saved, medicationId: null, dosage: "", dosageFrequency: "Once per week" };
  const noMedication = { ...blankPrescription(), dosage: "40 mg" };

  expect(completePrescriptions([untouched, frequencyCleared, savedButCleared])).toEqual([savedButCleared]);
  expect(prescriptionError([savedButCleared])).toBe("Each prescription needs a dosage.");
  expect(prescriptionError([noMedication])).toBe("Choose a medication for each new prescription.");
  expect(prescriptionError([saved, { ...noMedication, medicationId: "med-amox" }])).toBe("");
});
