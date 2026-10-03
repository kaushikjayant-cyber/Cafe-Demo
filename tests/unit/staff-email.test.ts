import { describe, expect, it } from "vitest";

import { loginEmail, staffEmail } from "@/lib/staff-email";

const domain = "staff.example.com";

describe("staffEmail", () => {
  it("maps a cafe username to a synthetic address on our domain", () => {
    expect(staffEmail("demo", "counter", domain)).toBe("counter.demo@staff.example.com");
    expect(staffEmail("blue-bean", "Ravi.K", domain)).toBe("ravi.k.blue-bean@staff.example.com");
  });

  it("keeps the same username at two cafes apart", () => {
    expect(staffEmail("cafe-a", "counter", domain)).not.toBe(staffEmail("cafe-b", "counter", domain));
  });
});

describe("loginEmail", () => {
  it("accepts owners' real emails and staff usernames", () => {
    expect(loginEmail("demo", "  Owner@BrewBloom.in ", domain)).toBe("owner@brewbloom.in");
    expect(loginEmail("demo", "Kitchen", domain)).toBe("kitchen.demo@staff.example.com");
  });

  it("rejects anything that isn't a valid username or email", () => {
    expect(loginEmail("demo", "ab", domain)).toBeNull();
    expect(loginEmail("demo", "has space", domain)).toBeNull();
    expect(loginEmail("demo", "not@an-email", domain)).toBeNull();
  });
});
