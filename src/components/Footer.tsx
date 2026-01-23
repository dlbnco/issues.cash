import { getWebsiteNetworkName } from "@/lib/network-filter";

export function Footer() {
  const network = getWebsiteNetworkName();

  return (
    <footer className="footer footer-center p-4 bg-base-100 text-base-content border-t border-base-200">
      <aside>
        <p className="font-mono text-sm opacity-60">
          Trustless bounties on Bitcoin Cash
          <span className="mx-2">·</span>
          <span>{network}</span>
        </p>
      </aside>
    </footer>
  );
}
