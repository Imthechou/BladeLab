// Only sample frames that aim for 60 Hz. Intentional idle renders and background
// pauses must never be mistaken for an overloaded GPU.
export class RenderBudget {
  constructor(ratio) {
    this.ratio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    this.floor = Math.min(1, this.ratio);
    this.average = 1000 / 60;
    this.slow = 0;
    this.changedAt = -Infinity;
  }

  sample(delta, now) {
    if (!(delta > 0) || delta > 200) return null;
    this.average = this.average * .85 + Math.min(delta, 80) * .15;
    this.slow = this.average > 23 ? this.slow + 1 : Math.max(0, this.slow - 2);
    if (this.slow < 12 || now - this.changedAt < 1200 || this.ratio <= this.floor) return null;
    this.ratio = Math.max(this.floor, this.ratio - .25);
    this.average = 1000 / 60;
    this.slow = 0;
    this.changedAt = now;
    return this.ratio;
  }
}
