import {
  type AirAirline,
  type AirAirport,
  type AirGate,
  type BusCompany,
  type BusStop,
  GD,
  type ID,
  type Located,
  type RailCompany,
  type RailStation,
  type SeaCompany,
  type SeaStop,
  type SpawnWarp,
  type Town,
} from "gatelogue-types";

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

const AIRPORT_TO_GATE_COST = 20;
const WARP_COST = 10;
const FLYING_MPS = 8;
const CHANGING_COST = 10;

function dijkstra(from: number, to: number): string[] {
  // type I = {i: number, line?: number}
  const q: number[] = [from];

  const costs = new Map<number, number>();
  costs.set(from, 0);

  const cameFrom = new Map<number, { from: number; text?: string }>();
  for (const sw of gd.spawnWarps) {
    cameFrom.set(sw.i, {from, text: `Take spawn warp to ${sw.name}`})
    costs.set(sw.i, CHANGING_COST)
    q.push(sw.i)
  }

  const neighbours = new Map<number, { cost: number; text?: string }>();

  while (q.length !== 0) {
    const i = q.sort((a, b) => costs.get(b)! - costs.get(a)!).pop()!;
    const cost = costs.get(i)!;

    if (i === to) {
      const output = [];
      let fi = to;
      while (fi !== from) {
        let { from: f, text } = cameFrom.get(fi)!;
        fi = f;
        if (text) output.push(text);
        console.log(text, from, to, fi)
      }
      return output.reverse();
    }

    let node = gd.node(i)!;

    if (node.type !== "AirGate") {
      const nodeLocated = node as Located<false>;
      for (const [pi, prox] of Object.entries(nodeLocated.proximity)) {
        const nodeProx = gd.node(pi)!
        neighbours.set(parseInt(pi), {
          cost: cost + prox.distance / FLYING_MPS,
          text: `Fly ${Math.round(prox.distance)} blocks to ${nodeProx.type} ${displayNode(nodeProx)}`,
        });
      }
      for (const si of nodeLocated.shared_facility) {
        const nodeSF = gd.node(si)!
        neighbours.set(si, {
          cost: cost + CHANGING_COST,
          text: `Change to ${nodeSF.type} ${(gd.node(nodeSF.company)! as BusCompany<false> | SeaCompany<false> | AirAirline<false> | RailCompany<false>).name} ${displayNode(gd.node(si)!)}`,
        });
      }
    }

    switch (node.type) {
      case "AirAirport":
        const nodeAirport = node as AirAirport<false>;
        for (const gi of nodeAirport.gates) {
          const gateCode = gd.airGate(gi)!.code;
          neighbours.set(gi, {
            cost: cost + AIRPORT_TO_GATE_COST,
            text: gateCode ? `Go to gate ${gateCode}` : undefined,
          });
        }
        break;
      case "AirGate":
        const nodeGate = node as AirGate<false>;
        neighbours.set(nodeGate.airport, { cost });
        for (const gi of gd.airAirport(nodeGate.airport)!.gates) {
          if (gi === i) continue;
          const gateCode = gd.airGate(gi)!.code;
          neighbours.set(gi, {
            cost: cost + AIRPORT_TO_GATE_COST,
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
            neighbours.set(gi2, {
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
            neighbours.set(parseInt(ci), {
              cost: cost + WARP_COST,
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
            const busLine = gd.busLine(conn.line)!;
            const companyName = gd.busCompany(busLine.company)!.name;
            let label =
              (conn.direction?.direction === i
                ? conn.direction?.backward_label
                : conn.direction?.forward_label) ?? "";
            if (label) label = `(${label}) `;
            neighbours.set(parseInt(ci), {
              cost: cost + WARP_COST,
              text: `Take ${companyName} ${displayNode(busLine)} ${label}to ${displayNode(nodeRail2)}`,
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
            const busLine = gd.busLine(conn.line)!;
            const companyName = gd.busCompany(busLine.company)!.name;
            let label =
              (conn.direction?.direction === i
                ? conn.direction?.backward_label
                : conn.direction?.forward_label) ?? "";
            if (label) label = `(${label}) `;
            neighbours.set(parseInt(ci), {
              cost: cost + WARP_COST,
              text: `Take ${companyName} ${displayNode(busLine)} ${label}to ${displayNode(nodeSea2)}`,
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
        cameFrom.set(ni, { from: i, text });
        costs.set(ni, newCost);
      }
    }
    neighbours.clear();
  }

  return ["No solution"];
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
