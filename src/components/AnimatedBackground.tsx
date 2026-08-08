"use client";

const particles = [
  { left: "8%", top: "22%", delay: "0s", size: 2 },
  { left: "18%", top: "68%", delay: "1.2s", size: 3 },
  { left: "28%", top: "14%", delay: "2.4s", size: 2 },
  { left: "42%", top: "78%", delay: "0.6s", size: 2 },
  { left: "55%", top: "18%", delay: "3.1s", size: 3 },
  { left: "66%", top: "62%", delay: "1.8s", size: 2 },
  { left: "78%", top: "28%", delay: "2.8s", size: 2 },
  { left: "88%", top: "72%", delay: "0.9s", size: 3 },
  { left: "12%", top: "48%", delay: "3.6s", size: 2 },
  { left: "72%", top: "44%", delay: "4.2s", size: 2 },
  { left: "36%", top: "36%", delay: "1.5s", size: 2 },
  { left: "92%", top: "12%", delay: "2.1s", size: 2 },
];

export const AnimatedBackground = () => {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[#060a14]" />

      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 75% 55% at 50% -5%, rgba(37, 99, 235, 0.22), transparent 58%), radial-gradient(ellipse 45% 40% at 85% 85%, rgba(14, 165, 233, 0.12), transparent 52%), radial-gradient(ellipse 40% 35% at 10% 70%, rgba(59, 130, 246, 0.1), transparent 50%)",
        }}
      />

      <div className="aurora aurora-a" />
      <div className="aurora aurora-b" />

      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <div className="orb orb-c" />
      <div className="orb orb-d" />

      <div className="absolute inset-0 opacity-[0.045] mix-blend-soft-light ambient-grid" />

      <div className="particle-field">
        {particles.map((p, i) => (
          <span
            key={i}
            className="particle"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              animationDelay: p.delay,
            }}
          />
        ))}
      </div>

      <div className="shimmer-sweep" />

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_12%,rgba(4,8,18,0.72)_100%)]" />
    </div>
  );
};
