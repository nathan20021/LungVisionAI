import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import LoginPage from "../LoginPage";

const mockAuth = {
  isAuthenticated: () => false,
  login: jest.fn(),
  register: jest.fn(),
  ssoAvailable: true,
};
jest.mock("../../context/Authentication", () => ({ useAuth: () => mockAuth }));
let mockPath = "/login";
jest.mock("react-router-dom", () => ({
  Navigate: () => null,
  useLocation: () => ({ pathname: mockPath }),
}));

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

beforeEach(() => jest.clearAllMocks());

const renderAt = (path) => {
  mockPath = path;
  return render(<LoginPage />);
};
const pane = (name) => within(screen.getByRole("tabpanel", { name }));

test("sign in passes the typed email on to the sign-in page", async () => {
  mockAuth.login.mockResolvedValue();
  renderAt("/login");

  expect(screen.getByRole("tab", { name: "Sign in" })).toHaveAttribute("aria-selected", "true");
  fireEvent.change(pane("Sign in").getByLabelText("Work email"), {
    target: { value: "jane@hospital.org" },
  });
  fireEvent.click(pane("Sign in").getByText("Continue"));

  await waitFor(() =>
    expect(mockAuth.login).toHaveBeenCalledWith("jane@hospital.org", { sso: false })
  );
});

test("Sign in with Google goes straight to the SSO provider", async () => {
  mockAuth.login.mockResolvedValue();
  renderAt("/login");

  fireEvent.click(pane("Sign in").getByText("Sign in with Google"));

  await waitFor(() => expect(mockAuth.login).toHaveBeenCalledWith(undefined, { sso: true }));
});

test("create account checks each step, registers, and shares the email with sign in", async () => {
  mockAuth.register.mockResolvedValue(true);
  renderAt("/register");
  const signUp = pane("Create account");

  expect(screen.getByRole("tab", { name: "Create account" })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(signUp.getByText("Continue"));
  expect(signUp.getByRole("alert")).toHaveTextContent("Enter a valid work email");

  fireEvent.change(signUp.getByLabelText("Work email"), { target: { value: "jane@hospital.org" } });
  fireEvent.change(signUp.getByLabelText("First name"), { target: { value: "Jane" } });
  fireEvent.change(signUp.getByLabelText("Last name"), { target: { value: "Doe" } });
  fireEvent.click(signUp.getByText("Continue"));
  expect(signUp.getByText("Step 2 of 3 · Your practice")).toBeInTheDocument();

  fireEvent.change(signUp.getByLabelText("Organization"), { target: { value: "Toronto General" } });
  fireEvent.click(signUp.getByText("Continue"));
  fireEvent.change(signUp.getByLabelText("Password"), { target: { value: "secret-1" } });
  fireEvent.change(signUp.getByLabelText("Confirm password"), { target: { value: "secret-2" } });
  fireEvent.click(signUp.getByRole("button", { name: "Create account" }));
  expect(signUp.getByRole("alert")).toHaveTextContent("The passwords don't match.");
  expect(mockAuth.register).not.toHaveBeenCalled();

  fireEvent.change(signUp.getByLabelText("Confirm password"), { target: { value: "secret-1" } });
  fireEvent.click(signUp.getByRole("button", { name: "Create account" }));

  expect(await signUp.findByText("Welcome, Jane Doe")).toBeInTheDocument();
  expect(mockAuth.register).toHaveBeenCalledWith(
    "jane@hospital.org",
    "secret-1",
    expect.objectContaining({ first_name: "Jane", last_name: "Doe", organization: "Toronto General" })
  );
  expect(pane("Sign in").getByLabelText("Work email")).toHaveValue("jane@hospital.org");
});
