import type ts from 'typescript';
import type { BehaviorContract, BehaviorProviderName } from '../core/model';

export interface BehaviorProvider {
  name: BehaviorProviderName;
  extract(sourceFile: ts.SourceFile): BehaviorContract[];
}
