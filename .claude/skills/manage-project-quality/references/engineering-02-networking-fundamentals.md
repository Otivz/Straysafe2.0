# Networking Fundamentals

## Engineering Topic 2: Networking Fundamentals

**When to run this:** When debugging connectivity, latency, or TLS issues, or before making infra decisions (load balancer, CDN, multi-region) that depend on understanding the network path.

**Goal of this pass:** Confirm the team can reason about what happens between a client request and a server response — not memorize trivia, but recognize which layer a given production issue actually lives in.

## How to use this reference

Use each stable practice ID in a generated engineering worksheet. Record concrete evidence and choose Applied, Partial, Recommended, Unverified, or N/A. Preserve each dated worksheet as review history.

## Wrap-up

- This isn't a gate — nothing here blocks a release the way
  Critical/High security items in security phase reviews do.
- Total concepts in this topic: 10
- Useful as an onboarding read-through, a periodic self-audit, or context
  to hand an agent before it reviews related code.

---

## Concepts — Topic 2: Networking Fundamentals

Use the applicable practices below to populate the worksheet findings table.

| Practice ID | Practice | Why it matters | Evidence question |
|---|---|---|---|
| ENG-02-01 | DNS resolution | Wrong TTLs or stale records cause outages/slow failover that look like application bugs. | Do you know your DNS TTLs and what happens on a DNS provider outage or a failed cutover? |
| ENG-02-02 | TCP handshake | SYN/SYN-ACK/ACK latency adds to every new connection; connection reuse avoids paying it repeatedly. | Are connections being reused (keep-alive/pooling) where the handshake cost matters? |
| ENG-02-03 | TLS handshake | Adds round trips and CPU cost on top of TCP; session resumption and TLS version choice affect both. | Is TLS session resumption enabled, and is the minimum TLS version intentionally set? |
| ENG-02-04 | NAT | Explains why a server sees one client IP for many real users, and why some P2P/inbound-connection patterns don't work as expected. | Does any rate-limiting or per-client logic depend on client IP, and does it account for NAT'd clients sharing an IP? |
| ENG-02-05 | Load balancer types | L4 vs L7 balancers differ in what they can inspect and route on (raw TCP vs HTTP headers/paths). | Does the current load balancer type actually support the routing/health-check behavior the app needs? |
| ENG-02-06 | CDN edge caching | Wrong cache-control headers cause either stale content served for too long or origin overload from no caching at all. | Are cache-control/CDN cache-key rules deliberately set per route, not left at CDN defaults? |
| ENG-02-07 | Packet loss & retransmit | Retransmits show up as latency and timeouts that look application-side but are actually network-layer. | When debugging intermittent slowness, has packet loss been ruled out before blaming application code? |
| ENG-02-08 | MTU / fragmentation | Oversized packets get fragmented or dropped, which shows up as weird partial-failure behavior, especially over VPNs/tunnels. | Has MTU mismatch been considered for any VPN, tunnel, or container network path in play? |
| ENG-02-09 | Keep-alive | Persistent connections avoid the handshake cost per request but tie up server resources if left open too long. | Are keep-alive timeouts tuned deliberately on both client and server, not left at framework defaults? |
| ENG-02-10 | BGP routing | Explains internet-scale outages and route leaks — usually outside your control, but recognizable when it's the actual cause. | When a broad, upstream-looking outage occurs, is BGP/routing considered as a possible cause rather than assumed to be your infra? |
