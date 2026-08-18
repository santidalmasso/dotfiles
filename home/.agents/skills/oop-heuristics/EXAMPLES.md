# Examples — before/after per heuristic

TypeScript before/after pairs for [`oop-heuristics`](SKILL.md). Read the relevant pair before writing rewrite code in a recommendation, and match its style.

## H1 — One entity, one object

```typescript
// ❌ Primitive obsession — email is a domain concept with invariants
function sendInvite(email: string) {
  // What if it's not a valid email? Who validates? Everyone? No one?
}

// ✅ One entity, one object
class EmailAddress {
  private constructor(private readonly value: string) {}

  static create(value: string): EmailAddress {
    if (!EmailAddress.isValid(value)) {
      throw new Error(`Invalid email: ${value}`);
    }
    return new EmailAddress(value);
  }

  private static isValid(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  toString(): string {
    return this.value;
  }
}
```

## H2 — Objects created complete

```typescript
// ❌ Incomplete object — temporal coupling
class Order {
  items: OrderItem[] = [];
  customer?: Customer;

  setCustomer(c: Customer) {
    this.customer = c;
  }
  addItem(i: OrderItem) {
    this.items.push(i);
  }

  total(): number {
    // What if items is empty? What if customer is undefined?
    return this.items.reduce((sum, i) => sum + i.price, 0);
  }
}

// ✅ Complete from birth
class Order {
  private constructor(
    readonly customer: Customer,
    readonly items: ReadonlyArray<OrderItem>,
  ) {}

  static create(customer: Customer, items: OrderItem[]): Order {
    if (items.length === 0)
      throw new Error("Order must have at least one item");
    return new Order(customer, [...items]);
  }

  total(): number {
    return this.items.reduce((sum, i) => sum + i.price, 0);
  }
}
```

## H3 — Only valid objects

```typescript
// ❌ Invalid objects can exist
class Percentage {
  constructor(public value: number) {}
}
const p = new Percentage(250); // 250%? Depends on domain, but probably wrong

// ✅ Only valid objects
class Percentage {
  private constructor(private readonly value: number) {}

  static create(value: number): Percentage {
    if (value < 0 || value > 100) {
      throw new Error(`Percentage must be 0-100, got ${value}`);
    }
    return new Percentage(value);
  }

  asDecimal(): number {
    return this.value / 100;
  }
}
```

## H4 — No null for domain concepts

```typescript
// ❌ Null hides the domain concept
function getDiscount(customer: Customer): number | null {
  if (!customer.hasLoyaltyCard) return null;
  return customer.loyaltyCard.discountRate;
}
// Every caller: if (discount !== null) { ... }

// ✅ Null Object Pattern — polymorphism over conditionals
interface Discount {
  apply(amount: number): number;
}

class LoyaltyDiscount implements Discount {
  constructor(private readonly rate: number) {}
  apply(amount: number): number {
    return amount * (1 - rate);
  }
}

class NoDiscount implements Discount {
  apply(amount: number): number {
    return amount;
  }
}
// Callers just use: discount.apply(amount) — no conditionals
```

## H5 — Favor immutability

```typescript
// ❌ Mutable — who changed the price? when?
class Product {
  constructor(
    public name: string,
    public price: number,
  ) {}
  applyDiscount(rate: number) {
    this.price *= 1 - rate;
  }
}

// ✅ Immutable — each state is a distinct, traceable snapshot
class Product {
  private constructor(
    readonly name: string,
    readonly price: Money,
  ) {}

  static create(name: string, price: Money): Product {
    return new Product(name, price);
  }

  withDiscount(rate: Percentage): Product {
    return new Product(this.name, this.price.times(1 - rate.asDecimal()));
  }
}
```

## H6 — Don't break encapsulation

```typescript
// ❌ Broken encapsulation — logic leaks out
class BankAccount {
  constructor(public balance: number) {}
  getBalance(): number {
    return this.balance;
  }
  setBalance(b: number) {
    this.balance = b;
  }
}

// Caller does the work that belongs to the account
if (account.getBalance() >= amount) {
  account.setBalance(account.getBalance() - amount);
}

// ✅ Encapsulated — the object owns its behavior
class BankAccount {
  private constructor(private readonly balance: Money) {}

  withdraw(amount: Money): BankAccount {
    if (this.balance.isLessThan(amount)) {
      throw new Error("Insufficient funds");
    }
    return new BankAccount(this.balance.minus(amount));
  }

  deposit(amount: Money): BankAccount {
    return new BankAccount(this.balance.plus(amount));
  }
}
// Caller: const updated = account.withdraw(amount);
```
