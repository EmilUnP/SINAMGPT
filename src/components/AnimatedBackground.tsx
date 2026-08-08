"use client";

export const AnimatedBackground = () => {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[#060a14]" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(37, 99, 235, 0.18), transparent 55%), radial-gradient(ellipse 50% 40% at 80% 80%, rgba(14, 165, 233, 0.1), transparent 50%)",
        }}
      />
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <div className="orb orb-c" />
      <div className="absolute inset-0 opacity-[0.04] mix-blend-soft-light ambient-grid" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_15%,rgba(4,8,18,0.72)_100%)]" />
    </div>
  );
};
