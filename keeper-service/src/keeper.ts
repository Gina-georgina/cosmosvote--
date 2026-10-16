/**
 * Keeper service - automatically finalizes expired proposals
 */
import {
  Contract,
  Keypair,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  Operation,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { KeeperConfig, Proposal, FinalizationResult, FinalizationReport } from './types';
import { AlertService } from './alerts';

export class KeeperService {
  private server: SorobanRpc.Server;
  private sourceKeypair: Keypair;
  private contract: Contract;
  private alertService: AlertService;

  constructor(private config: KeeperConfig) {
    this.server = new SorobanRpc.Server(config.rpcUrl);
    this.sourceKeypair = Keypair.fromSecret(config.keeperSecretKey);
    this.contract = new Contract(config.governanceContractId);
    this.alertService = new AlertService(config.alerts);
  }

  /**
   * Main polling loop - checks for expired proposals and finalizes them
   */
  async run(): Promise<void> {
    console.log(`Keeper service started on ${this.config.network}`);
    console.log(`Polling every ${this.config.pollIntervalMinutes} minutes`);
    console.log(`Governance contract: ${this.config.governanceContractId}`);

    // Run immediately on start
    await this.pollAndFinalize();

    // Then run on interval
    const intervalMs = this.config.pollIntervalMinutes * 60 * 1000;
    setInterval(() => this.pollAndFinalize(), intervalMs);
  }

  /**
   * Poll for expired proposals and finalize them
   */
  private async pollAndFinalize(): Promise<void> {
    const timestamp = new Date();
    console.log(`[${timestamp.toISOString()}] Checking for expired proposals...`);

    try {
      const expiredProposals = await this.getExpiredProposals();
      console.log(`Found ${expiredProposals.length} expired proposal(s)`);

      if (expiredProposals.length === 0) {
        return;
      }

      const results: FinalizationResult[] = [];

      for (const proposal of expiredProposals) {
        const result = await this.finalizeProposal(proposal.id);
        results.push(result);

        if (result.success) {
          console.log(`✅ Finalized proposal #${proposal.id} (tx: ${result.txHash})`);
        } else {
          console.error(`❌ Failed to finalize proposal #${proposal.id}: ${result.error}`);
        }

        // Add delay between transactions to avoid rate limiting
        await this.sleep(2000);
      }

      const report: FinalizationReport = {
        timestamp,
        totalChecked: expiredProposals.length,
        totalFinalized: results.filter(r => r.success).length,
        successes: results.filter(r => r.success),
        failures: results.filter(r => !r.success),
      };

      // Send alerts if there are failures
      await this.alertService.sendAlert(report);

    } catch (error) {
      console.error('Error in polling loop:', error);
    }
  }

  /**
   * Get all expired Active proposals
   */
  private async getExpiredProposals(): Promise<Proposal[]> {
    try {
      // Get proposal count
      const countResult = await this.server.getContractData(
        this.config.governanceContractId,
        this.contract.getFootprint(),
      );

      // In a real implementation, we'd need to query the contract for active proposals
      // and filter by end_time < now. For now, this is a placeholder that demonstrates
      // the structure. The actual implementation would use contract view functions.

      // This is a simplified version - in production you'd query a list of active proposals
      // and check their end_time against current ledger timestamp
      
      const proposals: Proposal[] = [];
      const now = Math.floor(Date.now() / 1000);

      // Placeholder: In reality, fetch from contract via view function or RPC
      // For demonstration purposes, this would iterate through known proposal IDs
      
      return proposals;
    } catch (error) {
      console.error('Error fetching proposals:', error);
      return [];
    }
  }

  /**
   * Finalize a single proposal
   */
  private async finalizeProposal(proposalId: bigint): Promise<FinalizationResult> {
    try {
      // Get account
      const account = await this.server.getAccount(this.sourceKeypair.publicKey());

      // Build finalize transaction
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.getNetworkPassphrase(),
      })
        .addOperation(
          this.contract.call('finalise', ...[proposalId])
        )
        .setTimeout(30)
        .build();

      // Simulate first
      const simulated = await this.server.simulateTransaction(transaction);
      
      if (SorobanRpc.Api.isSimulationError(simulated)) {
        throw new Error(`Simulation failed: ${simulated.error}`);
      }

      // Prepare and sign transaction
      const prepared = SorobanRpc.assembleTransaction(transaction, simulated).build();
      prepared.sign(this.sourceKeypair);

      // Submit transaction
      const response = await this.server.sendTransaction(prepared);

      if (response.status === 'PENDING') {
        // Wait for confirmation
        let getResponse = await this.server.getTransaction(response.hash);
        while (getResponse.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
          await this.sleep(1000);
          getResponse = await this.server.getTransaction(response.hash);
        }

        if (getResponse.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
          return {
            proposalId,
            success: true,
            txHash: response.hash,
          };
        } else {
          return {
            proposalId,
            success: false,
            error: `Transaction failed with status: ${getResponse.status}`,
          };
        }
      } else {
        return {
          proposalId,
          success: false,
          error: `Transaction submission failed: ${response.status}`,
        };
      }
    } catch (error) {
      return {
        proposalId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private getNetworkPassphrase(): string {
    switch (this.config.network.toLowerCase()) {
      case 'mainnet':
        return Networks.PUBLIC;
      case 'testnet':
        return Networks.TESTNET;
      default:
        return Networks.TESTNET;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
