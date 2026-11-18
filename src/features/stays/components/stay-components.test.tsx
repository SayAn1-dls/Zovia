import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QtyStepper } from "./qty-stepper";
import { QuestionDisclosure, openQuestion } from "./question-disclosure";
import { SoldOutStrip } from "./room-type-card";
import { StaySummary } from "./stay-summary";
import { availabilityFixture, quoteFixture } from "./stays-test-utils";

afterEach(cleanup);

describe("QtyStepper", () => {
  it("stops at the maximum and says why", () => {
    const onChange = vi.fn();
    render(<QtyStepper label="Single room beds" value={2} max={2} onChange={onChange} maxReason="Only 2 beds left." />);
    expect(screen.getByRole("button", { name: /one more/i })).toBeDisabled();
    expect(screen.getByText("Only 2 beds left.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /one fewer/i }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("removes the type below 1", () => {
    const onChange = vi.fn();
    render(<QtyStepper label="Single room beds" value={1} max={4} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /remove single room beds/i }));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("works from the keyboard and clamps", () => {
    const onChange = vi.fn();
    render(<QtyStepper label="Double sharing beds" value={3} max={3} onChange={onChange} />);
    const group = screen.getByRole("group", { name: "Double sharing beds" });
    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(group, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });
});

describe("StaySummary", () => {
  it("renders a server quote line by line", () => {
    const quote = quoteFixture();
    render(<StaySummary data={quote} dates={quote} />);
    expect(screen.getByText("Single room × 2")).toBeInTheDocument();
    expect(screen.getByText("₹300 × 3 nights")).toBeInTheDocument();
    expect(screen.getByText("Tax (5%)")).toBeInTheDocument();
    expect(screen.getByText("₹90")).toBeInTheDocument();
    expect(screen.getAllByText("₹1,800")).toHaveLength(1); // one line: no separate stay total
    expect(screen.queryByText("Stay total")).not.toBeInTheDocument();
    expect(screen.getByText("Payable now")).toBeInTheDocument();
    expect(screen.getAllByText("₹1,890")).toHaveLength(1); // payable now is the total (full prepayment)
    expect(screen.getByText(/· 3 nights/)).toBeInTheDocument();
  });

  it("adds a stay total only when there is more than one line", () => {
    const quote = quoteFixture({
      lines: [
        { room_type: "single", label: "Single room", units: 2, unit_price_inr: 300, nights: 3, line_total_inr: 1800 },
        { room_type: "double", label: "Double sharing", units: 1, unit_price_inr: 200, nights: 3, line_total_inr: 600 },
      ],
      stay_total_inr: 2400,
      tax_inr: 120,
      grand_total_inr: 2520,
      payable_now_inr: 2520,
    });
    render(<StaySummary data={quote} dates={quote} />);
    expect(screen.getByText("Stay total")).toBeInTheDocument();
    expect(screen.getByText("₹2,400")).toBeInTheDocument();
    expect(screen.getByText("₹2,520")).toBeInTheDocument();
  });

  it("asks for a bed when there is no quote", () => {
    render(<StaySummary data={null} dates={{ checkin: "2026-11-20", checkout: "2026-11-21", nights: 1 }} />);
    expect(screen.getByText("Select a bed to see the price.")).toBeInTheDocument();
  });
});

describe("SoldOutStrip", () => {
  it("shows beds and price per night and starts the stay on a free night", () => {
    const room = availabilityFixture().rooms[1]!;
    const onPick = vi.fn();
    render(<SoldOutStrip room={room} onPickNight={onPick} />);
    expect(screen.getByText("Sold out for these dates")).toBeInTheDocument();
    const nights = within(screen.getByRole("list", { name: /beds per night/i })).getAllByRole("button");
    expect(nights).toHaveLength(7);
    expect(nights[0]).toBeDisabled();
    expect(nights[0]).toHaveAccessibleName(/full/i);
    expect(nights[3]).toHaveAccessibleName(/2 beds left/);
    expect(nights[3]).toHaveTextContent("₹200");
    fireEvent.click(nights[3]!);
    expect(onPick).toHaveBeenCalledWith("2026-11-23");
  });
});

describe("QuestionDisclosure", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("starts folded, with the form still in the page for assistive tech once opened", () => {
    render(
      <QuestionDisclosure hint="We'll check with the property.">
        <label>
          Your name <input />
        </label>
      </QuestionDisclosure>,
    );
    const details = screen.getByTestId("question-disclosure") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText("Have a question?")).toBeInTheDocument();
    openQuestion();
    expect(details.open).toBe(true);
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
  });

  it("opens when the page is reached with #ask", () => {
    window.history.replaceState(null, "", "/properties/x#ask");
    render(<QuestionDisclosure hint="Hint">form</QuestionDisclosure>);
    expect((screen.getByTestId("question-disclosure") as HTMLDetailsElement).open).toBe(true);
  });
});
