import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QtyStepper } from "./qty-stepper";
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
    expect(screen.getAllByText("₹1,800")).toHaveLength(2); // the line and the stay total
    expect(screen.getByText("Payable now")).toBeInTheDocument();
    expect(screen.getAllByText("₹1,890")).toHaveLength(2);
    expect(screen.getByText(/· 3 nights/)).toBeInTheDocument();
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
