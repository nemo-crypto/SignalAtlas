import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useHeaderMarketTicker } from "../hooks/useHeaderMarketTicker";

const navItems = [
  { to: "/", label: "总览", short: "01" },
  { to: "/whale-tracker", label: "大单", short: "02" },
  { to: "/grid-signals", label: "网格", short: "03" }
];

export function AppLayout() {
  const location = useLocation();
  const headerTickerItems = useHeaderMarketTicker();
  const activeNav =
    navItems.find((item) =>
      item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to)
    ) ?? navItems[0];
  const activeNavIndex = Math.max(
    navItems.findIndex((item) => item.to === activeNav.to),
    0
  );
  const previousNavIndexRef = useRef(activeNavIndex);
  const navDirectionClass =
    activeNavIndex >= previousNavIndexRef.current ? "forward" : "backward";
  const stageMotionClass = location.pathname === "/" ? "home" : navDirectionClass;
  const navStyle = {
    ["--active-index" as const]: activeNavIndex,
    ["--nav-count" as const]: navItems.length
  } as CSSProperties;

  useEffect(() => {
    previousNavIndexRef.current = activeNavIndex;
  }, [activeNavIndex]);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-header-grid">
            <div className="app-brand-block">
              <div className="app-brand-lockup">
                <div className="brand-mark" aria-hidden="true">
                  <span className="brand-mark-core" />
                  <span className="brand-mark-orbit" />
                  <span className="brand-mark-spark brand-mark-spark-a" />
                  <span className="brand-mark-spark brand-mark-spark-b" />
                </div>
                <div className="app-brand-copy">
                  <p className="eyebrow">CryptoVision / Frontend MVP</p>
                  <h1>Signal Atlas</h1>
                </div>
              </div>
            </div>

            <nav className="top-nav" style={navStyle} aria-label="主导航">
              <span className="top-nav-indicator" aria-hidden="true">
                <span
                  key={`${activeNav.to}-${navDirectionClass}-fx`}
                  className={`top-nav-indicator-fx top-nav-indicator-fx-${navDirectionClass}`}
                />
                <span
                  key={`${activeNav.to}-${navDirectionClass}-rail`}
                  className={`top-nav-indicator-rail top-nav-indicator-rail-${navDirectionClass}`}
                />
              </span>
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    isActive ? "top-nav-item top-nav-item-active" : "top-nav-item"
                  }
                >
                  <span>{item.short}</span>
                  <strong>{item.label}</strong>
                </NavLink>
              ))}
            </nav>

            <div className="app-header-status" aria-label="头部状态">
              <span className="status-dot" />
              <div className="app-header-status-body">
                <div className="app-header-status-text">
                  <span className="app-header-status-item">Live Hooks</span>
                  <span className="app-header-status-separator" aria-hidden="true">
                    ·
                  </span>
                  <span className="app-header-status-item">Worker</span>
                  <span className="app-header-status-separator" aria-hidden="true">
                    ·
                  </span>
                  <span className="app-header-status-item">IndexedDB</span>
                </div>
                <div className="app-header-status-rail" aria-hidden="true">
                  <span className="app-header-status-flow app-header-status-flow-a" />
                  <span className="app-header-status-flow app-header-status-flow-b" />
                  <span className="app-header-status-flow app-header-status-flow-c" />
                </div>
              </div>
            </div>
          </div>
          <div className="app-header-ticker" aria-label="24 小时涨跌榜">
            <div className="app-header-ticker-track">
              {[0, 1].map((groupIndex) => (
                <div
                  key={`ticker-group-${groupIndex}`}
                  className="app-header-ticker-group"
                  aria-hidden={groupIndex === 1}
                >
                  {headerTickerItems.map((item, index) => (
                    <span
                      key={`ticker-${groupIndex}-${item.id}-${index}`}
                      className={`app-header-ticker-chip app-header-ticker-chip-${item.direction} ${
                        item.flashToken > 0
                          ? `app-header-ticker-chip-flash-${item.flashToken % 2 === 0 ? "a" : "b"}`
                          : ""
                      }`}
                    >
                      <strong>{item.badge}</strong>
                      <span className="app-header-ticker-chip-symbol">{item.symbol}</span>
                      <span className="app-header-ticker-chip-price">{item.priceLabel}</span>
                      <span
                        className={`app-header-ticker-chip-change app-header-ticker-chip-change-${item.direction}`}
                      >
                        {item.changeLabel}
                      </span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="main-shell">
        <section
          key={location.pathname}
          className={`content-stage content-stage-${stageMotionClass}`}
        >
          <div className="content-stage-body">
            <Outlet />
          </div>
        </section>
      </main>
    </div>
  );
}
