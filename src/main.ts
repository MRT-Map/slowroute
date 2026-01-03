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
import 'select2/dist/css/select2.css';
// @ts-expect-error
select2($)

// const htmlFromType = document.getElementById("fromType")! as HTMLSelectElement
// const htmlToType = document.getElementById("toType")! as HTMLSelectElement
const htmlFrom = document.getElementById("from")! as HTMLSelectElement;
const htmlTo = document.getElementById("to")! as HTMLSelectElement;
const htmlOut = document.getElementById("out")! as HTMLDivElement;
const htmlGo = document.getElementById("go")! as HTMLButtonElement;

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
$('#from').select2();
$('#to').select2();

const WARP_COST = 10;
const FLYING_MPS = 8;
const CHANGING_COST = 15;

function dijkstra(from: IntID<Node>, to: IntID<Node>): string[] {
  type I = `${ID<Node>}` | `${ID<Node>} ${ID<BusLine | SeaLine | RailLine>}`;
  const q: I[] = [`${from}`];

  const costs = new Map<I, number>();
  costs.set(`${from}`, 0);

  const cameFrom = new Map<I, { from: I; text?: string }>();
  for (const sw of gd.spawnWarps) {
    cameFrom.set(`${sw.i}`, {
      from: `${from}`,
      text: `Take spawn warp to ${sw.name}`,
    });
    costs.set(`${sw.i}`, CHANGING_COST);
    q.push(`${sw.i}`);
  }

  const neighbours = new Map<I, { cost: number; text?: string }>();

  while (q.length !== 0) {
    console.log(q.length);
    const il = q.sort((a, b) => costs.get(b)! - costs.get(a)!).pop()!;
    const i = parseInt(il.split(" ")[0]);
    const iLine = il.includes(" ") ? parseInt(il.split(" ")[1]) : undefined;
    const cost = costs.get(il)!;

    if (i === to) {
      const output = [];
      let fi: I = il;
      while (fi.split(" ")[0] !== `${from}`) {
        let { from: f, text } = cameFrom.get(fi)!;
        fi = f;
        if (text) output.push(text);
      }
      return output.reverse();
    }

    let node = gd.node(i)!;
    console.log(node);

    if (node.type !== "AirGate") {
      const nodeLocated = node as Located<false>;
      for (const [pi, prox] of Object.entries(nodeLocated.proximity)) {
        const nodeProx = gd.node(pi)!;
        neighbours.set(pi as I, {
          cost: cost + prox.distance / FLYING_MPS + CHANGING_COST,
          // @ts-expect-error
          text: `Fly ${Math.round(prox.distance)} blocks to ${nodeProx.type} ${displayNode(nodeProx)}`,
        });
      }
      for (const si of nodeLocated.shared_facility) {
        const nodeSF = gd.node(si)!;
        neighbours.set(`${si}`, {
          cost: cost + CHANGING_COST,
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
            cost: cost + CHANGING_COST,
            text: gateCode ? `Go to gate ${gateCode}` : undefined,
          });
        }
        break;
      case "AirGate":
        const nodeGate = node as AirGate<false>;
        neighbours.set(`${nodeGate.airport}`, { cost });
        for (const gi of gd.airAirport(nodeGate.airport)!.gates) {
          if (gi === i) continue;
          const gateCode = gd.airGate(gi)!.code;
          neighbours.set(`${gi}`, {
            cost: cost + CHANGING_COST,
            text: gateCode ? `Go to gate ${gateCode}` : undefined,
          });
        }
        for (const fi of nodeGate.flights) {
          const nodeFlight = gd.airFlight(fi)!;
          for (const gi2 of nodeFlight.gates) {
            if (gi2 === i) continue;
            const nodeGate2 = gd.airGate(gi2)!;
            const airlineName = gd.airAirline(nodeFlight.airline)!.name;
            const flightCode = nodeFlight.codes.join("/");
            const nodeAirport = gd.airAirport(nodeGate2.airport)!;
            neighbours.set(`${gi2}`, {
              cost: cost + WARP_COST,
              text:
                (nodeGate.code !== null ? `At Gate ${nodeGate.code} t` : "T") +
                `ake ${airlineName} ${flightCode} to ${displayNode(nodeAirport)}` +
                (nodeGate2.code !== null ? ` (Gate ${nodeGate2.code})` : ""),
            });
          }
        }
        break;
      case "BusStop":
        const nodeBus = node as BusStop<false>;
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
            const companyName = gd.busCompany(busLine.company)!.name;
            let label =
              (conn.direction?.direction === i
                ? conn.direction?.backward_label
                : conn.direction?.forward_label) ?? "";
            if (label) label = `(${label}) `;
            neighbours.set(`${ci} ${busLine.i}`, {
              cost: cost + WARP_COST + (iLine === busLine.i ? 0 : CHANGING_COST),
              text: `Take ${companyName} ${displayNode(busLine)} ${label}to ${displayNode(nodeBus2)}`,
            });
          }
        }
        break;
      case "RailStation":
        const nodeRail = node as RailStation<false>;
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
            const companyName = gd.railCompany(railLine.company)!.name;
            let label =
              (conn.direction?.direction === i
                ? conn.direction?.backward_label
                : conn.direction?.forward_label) ?? "";
            if (label) label = `(${label}) `;
            neighbours.set(`${ci} ${railLine.i}`, {
              cost: cost + WARP_COST + (iLine === railLine.i ? 0 : CHANGING_COST),
              text: `Take ${companyName} ${displayNode(railLine)} ${label}to ${displayNode(nodeRail2)}`,
            });
          }
        }
        break;
      case "SeaStop":
        const nodeSea = node as SeaStop<false>;
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
            const companyName = gd.seaCompany(seaLine.company)!.name;
            let label =
              (conn.direction?.direction === i
                ? conn.direction?.backward_label
                : conn.direction?.forward_label) ?? "";
            if (label) label = `(${label}) `;
            neighbours.set(`${ci} ${seaLine.i}`, {
              cost: cost + WARP_COST + (iLine === seaLine.i ? 0 : CHANGING_COST),
              text: `Take ${companyName} ${displayNode(seaLine)} ${label}to ${displayNode(nodeSea2)}`,
            });
          }
        }
        break;
      case "SpawnWarp":
        break;
      default:
        continue;
    }

    for (const [ni, { cost: newCost, text }] of neighbours) {
      const existingCost = costs.get(ni) ?? Infinity;
      if (!costs.has(ni)) q.push(ni);
      if (newCost < existingCost) {
        cameFrom.set(ni, { from: il, text });
        costs.set(ni, newCost);
      }
    }
    neighbours.clear();
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

  htmlOut.innerHTML += dijkstra(fromI, toI).join("<br>");
});
