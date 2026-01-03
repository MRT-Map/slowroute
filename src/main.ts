import {
  type AirAirport,
  type AirGate,
  type BusLine,
  type BusStop,
  GD,
  type ID,
  type IntID,
  type Located,
  type Node,
  type RailLine,
  type RailStation,
  type SeaLine,
  type SeaStop,
  type SpawnWarp,
  type Town,
} from "gatelogue-types";
import $ from "jquery";
import select2 from "select2";
import "select2/dist/css/select2.css";
// @ts-expect-error
select2($);

const htmlFrom = document.getElementById("from")! as HTMLSelectElement;
const htmlTo = document.getElementById("to")! as HTMLSelectElement;
const htmlOut = document.getElementById("out")! as HTMLDivElement;
const htmlGo = document.getElementById("go")! as HTMLButtonElement;
const htmlFromRandom = document.getElementById("from-random")! as HTMLButtonElement;
const htmlToRandom = document.getElementById("to-random")! as HTMLButtonElement;
const gd = await GD.getNoSources();

function displayNode(node: {
  codes?: string[] | null;
  code?: string | null;
  name?: string | null;
  names?: string[] | null;
}) {
  const codes2 = node.codes ?? (node.code ? [node.code] : []);
  const name2 = node.names ? node.names.join("/") : node.name;
  if (
    codes2.length !== 0 &&
    name2 &&
    (codes2.length != 1 || codes2[0] !== name2)
  ) {
    return `${name2} (${codes2.join("/")})`;
  } else if (!name2) {
    return codes2?.join("/") ?? "";
  } else {
    return name2 ?? "";
  }
}

function setupDropdown() {
  let options: [number, string][] = [];
  for (const node of gd.nodes) {
    let option;
    switch (node.type) {
      case "AirAirport":
        const nodeAirport = node as AirAirport<false>;
        option = `${nodeAirport.names?.join("/")} (${nodeAirport.code})`;
        break;
      case "BusStop":
        const nodeBus = node as BusStop<false>;
        const busCompanyName = gd.busCompany(nodeBus.company)!.name;
        option = `[${busCompanyName}] ` + displayNode(nodeBus);
        break;
      case "RailStation":
        const nodeRail = node as RailStation<false>;
        const railCompanyName = gd.busCompany(nodeRail.company)!.name;
        option = `[${railCompanyName}] ` + displayNode(nodeRail);
        break;
      case "SeaStop":
        const nodeSea = node as SeaStop<false>;
        const seaCompanyName = gd.busCompany(nodeSea.company)!.name;
        option = `[${seaCompanyName}] ` + displayNode(nodeSea);
        break;
      case "Town":
        const nodeTown = node as Town<false>;
        option = `${nodeTown.name} (${nodeTown.rank})`;
        break;
      case "SpawnWarp":
        const nodeSpawnWarp = node as SpawnWarp<false>;
        option = nodeSpawnWarp.name;
        break;
      default:
        continue;
    }
    options.push([node.i, `${node.type} ${option}`]);
  }
  const optionsString = options
    .sort(([_, a], [__, b]) => a.localeCompare(b))
    .map(([i, o]) => `<option value="${i}">${o}</option>`)
    .join();
  htmlFrom.innerHTML = optionsString;
  htmlTo.innerHTML = optionsString;
}
setupDropdown();

function randomDest(field: HTMLSelectElement) {
  const children = field.children
  const option = children[Math.floor(Math.random()*children.length)] as HTMLOptionElement;
  field.value = option.value
  $(field).select2()
}
htmlFromRandom.addEventListener("click", () => randomDest(htmlFrom))
htmlToRandom.addEventListener("click", () => randomDest(htmlTo))
randomDest(htmlFrom)
randomDest(htmlTo)

const MODES = [
  "air",
  "sea",
  "bus",
  "rail",
  "spawn-warp",
  "traincarts",
  "warp",
  "vehicles",
  "cart",
] as const;
const SPEEDS = {
  "walk": 6,
  "walk10": 15,
  "fly": 20,
  "fly10": 100,
}
type DijkstraConfig = {
  WARP_COST: number;
  FLYING_MPS: number;
  TRAINCART_MPS: number;
  CART_MPS: number;
  CHANGING_COST: number;
  ROUTE_BY: Set<(typeof MODES)[number]>;
};

const CONFIG: DijkstraConfig = {
  WARP_COST: 5,
  FLYING_MPS: SPEEDS["fly"],
  TRAINCART_MPS: 50,
  CART_MPS: 8,
  CHANGING_COST: 15,
  ROUTE_BY: new Set(MODES),
};

function setupProxRadioButtons() {
  for (const [id, speed] of Object.entries(SPEEDS)) {
    const radio = document.getElementById(`prox-${id}`)! as HTMLInputElement
    if (id === "fly") radio.checked = true;
    radio.addEventListener("change", () => {
      if (radio.checked) CONFIG.FLYING_MPS = speed
    })
  }
}
setupProxRadioButtons()

function setupRouteByCheckboxes() {
  for (const mode of MODES) {
    const checkbox = document.getElementById(
      `route-by-${mode}`,
    )! as HTMLInputElement;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        CONFIG.ROUTE_BY.add(mode);
      } else {
        CONFIG.ROUTE_BY.delete(mode);
      }
    });
    if (CONFIG.ROUTE_BY.has(mode)) checkbox.checked = true;
  }
}
setupRouteByCheckboxes();

function distance(from: [number, number] | null, to: [number, number] | null) {
  if (from === null || to === null) {
    return 60 * 5;
  }
  return Math.sqrt(Math.pow(from[0] - to[0], 2) + Math.pow(from[1] - to[1], 2));
}

function dijkstra(from: IntID<Node>, to: IntID<Node>): string[] {
  type I = `${ID<Node>}` | `${ID<Node>} ${ID<BusLine | SeaLine | RailLine>}`;
  const q: I[] = [`${from}`];

  const costs = new Map<I, number>();
  costs.set(`${from}`, 0);

  const cameFrom = new Map<I, { from: I; text?: string }>();
  if (CONFIG.ROUTE_BY.has("spawn-warp"))
    for (const sw of gd.spawnWarps) {
      cameFrom.set(`${sw.i}`, {
        from: `${from}`,
        text: `Take spawn warp to ${sw.name}`,
      });
      costs.set(`${sw.i}`, CONFIG.CHANGING_COST);
      q.push(`${sw.i}`);
    }

  while (q.length !== 0) {
    const il = q.sort((a, b) => costs.get(b)! - costs.get(a)!).pop()!;
    const i = parseInt(il.split(" ")[0]);
    const iLine = il.includes(" ") ? parseInt(il.split(" ")[1]) : undefined;
    const cost = costs.get(il)!;

    if (i === to) {
      const output = [];
      let fi: I = il;
      while (fi.split(" ")[0] !== `${from}`) {
        let { from: f, text } = cameFrom.get(fi)!;
        console.log(gd.node(fi.split(" ")[0]), "comes from", gd.node(f.split(" ")[0]))
        fi = f;
        if (text) output.push(text);
      }
      output.push(`Will take ~${Math.round(cost)} seconds`)
      // @ts-ignore
      if (!gd.node(to)!.coordinates) output.push("WARNING: End has unknown coordinates")
      // @ts-ignore
      if (!gd.node(from)!.coordinates) output.push("WARNING : Start has unknown coordinates")
      return output.reverse();
    }

    let node = gd.node(i)!;
    console.log(node, q.length);

    const neighbours = new Map<I, { cost: number; text?: string }>();

    if (node.type !== "AirGate") {
      const nodeLocated = node as Located<false>;
      for (const [pi, prox] of Object.entries(nodeLocated.proximity)) {
        const nodeProx = gd.node(pi)!;
        neighbours.set(pi as I, {
          cost: cost + prox.distance / CONFIG.FLYING_MPS + CONFIG.CHANGING_COST,
          // @ts-expect-error
          text: `Fly ${Math.round(prox.distance)} blocks to ${nodeProx.type} ${displayNode(nodeProx)}`,
        });
      }
      for (const si of nodeLocated.shared_facility) {
        const nodeSF = gd.node(si)!;
        neighbours.set(`${si}`, {
          cost: cost + CONFIG.CHANGING_COST,
          // @ts-expect-error
          text: `Change to ${nodeSF.type} ${gd.node(nodeSF.company)!.name} ${displayNode(gd.node(si)!)}`,
        });
      }
    }

    switch (node.type) {
      case "AirAirport":
        const nodeAirport = node as AirAirport<false>;
        for (const gi of nodeAirport.gates) {
          const gateCode = gd.airGate(gi)!.code;
          neighbours.set(`${gi}`, {
            cost: cost + CONFIG.CHANGING_COST,
            text: gateCode ? `Go to gate ${gateCode}` : undefined,
          });
        }
        break;
      case "AirGate":
        const nodeGate = node as AirGate<false>;
        neighbours.set(`${nodeGate.airport}`, { cost });
        const nodeGateAirport = gd.airAirport(nodeGate.airport)!;
        for (const gi of nodeGateAirport.gates) {
          if (gi === i) continue;
          const gateCode = gd.airGate(gi)!.code;
          neighbours.set(`${gi}`, {
            cost: cost + CONFIG.CHANGING_COST,
            text: gateCode ? `Go to gate ${gateCode}` : undefined,
          });
        }
        if (CONFIG.ROUTE_BY.has("air"))
          for (const fi of nodeGate.flights) {
            const nodeFlight = gd.airFlight(fi)!;
            if (
              nodeFlight.mode === "traincarts plane" &&
              !CONFIG.ROUTE_BY.has("traincarts")
            )
              continue;
            if (
              nodeFlight.mode !== "traincarts plane" &&
              !CONFIG.ROUTE_BY.has("warp")
            )
              continue;
            for (const gi2 of nodeFlight.gates) {
              if (gi2 === i) continue;
              const nodeGate2 = gd.airGate(gi2)!;
              const airlineName = gd.airAirline(nodeFlight.airline)!.name;
              const flightCode = nodeFlight.codes.join("/");
              const nodeGateAirport2 = gd.airAirport(nodeGate2.airport)!;
              neighbours.set(`${gi2}`, {
                cost:
                  cost +
                  (nodeGate.code === null ? CONFIG.CHANGING_COST : 0) +
                  (nodeFlight.mode === "traincarts plane"
                    ? distance(
                        nodeGateAirport.coordinates,
                        nodeGateAirport2.coordinates,
                      ) / CONFIG.TRAINCART_MPS
                    : CONFIG.WARP_COST),
                text:
                  (nodeGate.code !== null
                    ? `At Gate ${nodeGate.code} t`
                    : "T") +
                  `ake ${airlineName} ${flightCode} to ${displayNode(nodeGateAirport2)}` +
                  (nodeGate2.code !== null ? ` (Gate ${nodeGate2.code})` : ""),
              });
            }
          }
        break;
      case "BusStop":
        const nodeBus = node as BusStop<false>;
        if (CONFIG.ROUTE_BY.has("bus") && CONFIG.ROUTE_BY.has("warp"))
          for (const [ci, conns] of Object.entries(nodeBus.connections)) {
            const nodeBus2 = gd.busStop(ci)!;
            for (const conn of conns) {
              if (
                conn.direction &&
                conn.direction.one_way &&
                conn.direction.direction === i
              )
                continue;
              const busLine = gd.busLine(conn.line)!;
              // TODO busLine.mode
              const companyName = gd.busCompany(busLine.company)!.name;
              let label =
                (conn.direction?.direction === i
                  ? conn.direction?.backward_label
                  : conn.direction?.forward_label) ?? "";
              if (label) label = `(${label}) `;
              neighbours.set(`${ci} ${busLine.i}`, {
                cost:
                  cost +
                  CONFIG.WARP_COST +
                  (iLine === busLine.i ? 0 : CONFIG.CHANGING_COST),
                text: `Take ${companyName} ${displayNode(busLine)} ${label}to ${displayNode(nodeBus2)}`,
              });
            }
          }
        break;
      case "RailStation":
        const nodeRail = node as RailStation<false>;
        if (CONFIG.ROUTE_BY.has("rail"))
          for (const [ci, conns] of Object.entries(nodeRail.connections)) {
            const nodeRail2 = gd.railStation(ci)!;
            for (const conn of conns) {
              if (
                conn.direction &&
                conn.direction.one_way &&
                conn.direction.direction === i
              )
                continue;
              const railLine = gd.railLine(conn.line)!;
              if (
                railLine.mode === "traincarts" &&
                !CONFIG.ROUTE_BY.has("traincarts")
              )
                continue;
              if (railLine.mode === "warp" && !CONFIG.ROUTE_BY.has("warp"))
                continue;
              if (
                railLine.mode === "vehicles" &&
                !CONFIG.ROUTE_BY.has("vehicles")
              )
                continue;
              if (railLine.mode === "cart" && !CONFIG.ROUTE_BY.has("cart"))
                continue;
              const companyName = gd.railCompany(railLine.company)!.name;
              let label =
                (conn.direction?.direction === i
                  ? conn.direction?.backward_label
                  : conn.direction?.forward_label) ?? "";
              if (label) label = `(${label}) `;
              neighbours.set(`${ci} ${railLine.i}`, {
                cost:
                  cost +
                  (railLine.mode === "traincarts" || railLine.mode == "vehicles"
                    ? distance(nodeRail.coordinates, nodeRail2.coordinates) /
                      CONFIG.TRAINCART_MPS
                    : railLine.mode === "cart"
                      ? distance(nodeRail.coordinates, nodeRail2.coordinates) /
                        CONFIG.CART_MPS
                      : CONFIG.WARP_COST) +
                  (iLine === railLine.i ? 0 : CONFIG.CHANGING_COST),
                text: `Take ${companyName} ${displayNode(railLine)} ${label}to ${displayNode(nodeRail2)}`,
              });
            }
          }
        break;
      case "SeaStop":
        const nodeSea = node as SeaStop<false>;
        if (CONFIG.ROUTE_BY.has("sea") && CONFIG.ROUTE_BY.has("warp"))
          for (const [ci, conns] of Object.entries(nodeSea.connections)) {
            const nodeSea2 = gd.railStation(ci)!;
            for (const conn of conns) {
              if (
                conn.direction &&
                conn.direction.one_way &&
                conn.direction.direction === i
              )
                continue;
              const seaLine = gd.seaLine(conn.line)!;
              // TODO seaLine.mode
              const companyName = gd.seaCompany(seaLine.company)!.name;
              let label =
                (conn.direction?.direction === i
                  ? conn.direction?.backward_label
                  : conn.direction?.forward_label) ?? "";
              if (label) label = `(${label}) `;
              neighbours.set(`${ci} ${seaLine.i}`, {
                cost:
                  cost +
                  CONFIG.WARP_COST +
                  (iLine === seaLine.i ? 0 : CONFIG.CHANGING_COST),
                text: `Take ${companyName} ${displayNode(seaLine)} ${label}to ${displayNode(nodeSea2)}`,
              });
            }
          }
        break;
    }

    for (const [ni, { cost: newCost, text }] of neighbours) {
      const existingCost = costs.get(ni) ?? Infinity;
      if (!costs.has(ni)) q.push(ni);
      if (newCost < existingCost) {
        cameFrom.set(ni, { from: il, text });
        costs.set(ni, newCost);
      }
    }
  }

  return ["No route"];
}

htmlGo.addEventListener("click", () => {
  htmlOut.innerHTML = "";
  const fromI = parseInt(htmlFrom.value);
  const toI = parseInt(htmlTo.value);
  if (fromI === toI) {
    htmlOut.innerHTML = "Already there";
    return;
  }

  htmlOut.innerHTML += dijkstra(fromI, toI).map(a => a
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")).join("<br>");
});