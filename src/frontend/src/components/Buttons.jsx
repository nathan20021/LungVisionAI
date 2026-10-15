// Classes for the app's buttons; add spacing, width or height where they're used
export const PRIMARY_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-[#2c5465] active:scale-[0.97] transition font-medium disabled:opacity-60 disabled:active:scale-100";
export const SECONDARY_BUTTON_CLASS =
  "inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-md hover:bg-gray-50 active:scale-[0.97] transition font-medium disabled:opacity-50 disabled:active:scale-100";

export const PrimaryButton = ({ text, onClick, disabled = false }) => {
  return (
    <button
      disabled={disabled}
      className={`${
        disabled
          ? "bg-gray-400 cursor-not-allowed"
          : "bg-primary hover:bg-primaryHover"
      } text-white font-bold py-2 px-4 rounded`}
      onClick={onClick}
    >
      {text}
    </button>
  );
};

export const SecondaryButton = ({ text, onClick }) => {
  return (
    <button
      className="text-white font-bold py-2 px-4 rounded-sm border border-white hover:border-gray-300"
      onClick={onClick}
    >
      {text}
    </button>
  );
};

export const CancelButton = ({ text, onClick, disabled = false }) => {
  return (
    <button
      disabled={disabled}
      className={`${
        disabled
          ? "bg-gray-400 cursor-not-allowed"
          : "bg-[#ff6a6a] hover:bg-[#ff7979]"
      } text-white font-bold py-2 px-4 rounded`}
      onClick={onClick}
    >
      {text}
    </button>
  );
};
