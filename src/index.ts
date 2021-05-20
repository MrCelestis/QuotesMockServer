import _ from "lodash";
import WebSocket from 'ws';

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
    console.log('connection accepted');
    const gen = new MockDataGenerator(ws);
    ws.on('close', () => {
        console.log('closed');
        gen.destroy();
    });
});

interface QuoteDto {
    price: number;
    volume: number;
}

interface ContractQuoteDto {
    contractId: string;
    quote: QuoteDto;
}

interface ContractDto {
    id: string;
    name?: string;
    removed?: boolean;
}

interface ServerMsg {
    contracts: ContractDto[];
    quotes: ContractQuoteDto[];
}

class MockDataGenerator {
    private initialContracts = 8000;
    private maxContracts = 10000;
    private contractsById = new Map<string, ContractDto>();
    private pristineContracts = new Set<string>();

    private intervalIds: NodeJS.Timeout[];

    constructor(private readonly ws: WebSocket) {
        this.intervalIds = [
            this.setupContractUpdates(),
            this.setupQuoteUpdates()
        ];
        const serverMsg = <ServerMsg>{
            contracts: [],
            quotes: []
        };
        for (let i = 0; i < this.initialContracts; ++i) {
            serverMsg.contracts.push(this.createContract());
        }
        this.ws.send(JSON.stringify(serverMsg));
    }

    private setupContractUpdates(): NodeJS.Timeout {
        return setInterval(() => {
            const serverMsg = <ServerMsg>{
                contracts: [],
                quotes: []
            };
            if (this.contractsById.size < this.maxContracts && Math.random() > 0.75) {
                //add
                const addCount = Math.min(
                    this.maxContracts - this.contractsById.size,
                    1 + Math.round(Math.random() * (this.maxContracts / 100))
                );
                for (let i = 0; i < addCount; ++i) {
                    serverMsg.contracts.push(this.createContract());
                }
            }
            if (Math.random() > 0.75) {
                //update/delete
                this.contractsById.forEach(ctr => {
                    if (Math.random() > 0.9) {
                        ctr.name = `Updated contract ${ctr.id} - ${this.createGuid()}`;
                        serverMsg.contracts.push(ctr);
                    } else if (Math.random() > 0.9) {
                        ctr.removed = true;
                        delete ctr.name;
                        this.contractsById.delete(ctr.id);
                        this.pristineContracts.delete(ctr.id);
                        serverMsg.contracts.push(ctr);
                    }
                });
            }
            if (serverMsg.contracts.length) {
                this.ws.send(JSON.stringify(serverMsg));
            }
        }, 500);
    }

    private setupQuoteUpdates(): NodeJS.Timeout {
        return setInterval(() => {
            const serverMsg = <ServerMsg>{
                contracts: [],
                quotes: []
            };
            if (Math.random() > 0.15) {
                this.contractsById.forEach(ctr => {
                    const shouldSendQuotes = this.pristineContracts.has(ctr.id)
                        ? Math.random() > 0.95//lower probability to send large chunk of initial quotes
                        : Math.random() > 0.35;
                    if (shouldSendQuotes) {
                        const quoteCount = this.pristineContracts.has(ctr.id)
                            ? 50 + Math.round(Math.random() * 400)
                            : 1 + Math.round(Math.random() * 5);
                        this.pristineContracts.delete(ctr.id);
                        for (let i = 0; i < 1 + quoteCount; ++i) {
                            serverMsg.quotes.push({
                                contractId: ctr.id,
                                quote: {
                                    price: Math.round((Math.random() - 0.1) * 1000),
                                    volume: 1 + Math.round(Math.random() * 1000)
                                }
                            });
                        }
                    }
                });
            }
            if (serverMsg.quotes.length) {
                this.ws.send(JSON.stringify(serverMsg));
            }
        }, 150);
    }

    private createContract(): ContractDto {
        const id = this.createGuid();
        const newContract = <ContractDto>{ id, name: `Contract ${id}`};
        this.contractsById.set(newContract.id, newContract);
        this.pristineContracts.add(newContract.id);
        return newContract;
    }

    private createGuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    public destroy() {
        this.intervalIds.forEach(i => clearInterval(i));
    }
}