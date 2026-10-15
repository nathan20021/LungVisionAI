# The list doctors prescribe from, written to the medications table on every
# start by MedicalPrescriptionService.seed_medications. A medication removed or
# renamed here leaves the drop-down, but prescriptions that reference it keep it.

# category -> medications, as the sections of the medication drop-down
MEDICATIONS = {
    "Antibiotics": [
        "Amoxicillin",
        "Amoxicillin/clavulanate (Augmentin)",
        "Azithromycin",
        "Ceftriaxone",
        "Doxycycline",
    ],
    "Diuretics": [
        "Bumetanide",
        "Furosemide (Lasix)",
        "Torsemide",
    ],
    "Heart failure medications": [
        "Carvedilol",
        "Dapagliflozin (Forxiga)",
        "Empagliflozin (Jardiance)",
        "Metoprolol succinate",
        "Nitroglycerin",
        "Sacubitril/valsartan (Entresto)",
        "Spironolactone",
    ],
    "Symptom-relief medications": [
        "Acetaminophen (Tylenol)",
        "Albuterol (Ventolin)",
        "Ibuprofen (Advil)",
    ],
}
