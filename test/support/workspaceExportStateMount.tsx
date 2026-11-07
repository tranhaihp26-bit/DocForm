import React from 'react';
import {createRoot} from 'react-dom/client';
import {WorkspaceExport} from '../../src/components/WorkspaceExport.tsx';
import type {ExportCandidate} from '../../src/utils/exportCandidate.ts';

type WorkspaceExportFixture = {
  id: string;
  candidate: Omit<ExportCandidate, 'bytes'> & {bytesBase64:string};
};

declare global {
  interface Window {
    __workspaceExportStateCalls?: Record<string, number>;
  }
}

export function mountWorkspaceExportStateFixtures(fixtures:WorkspaceExportFixture[]):void{
  window.__workspaceExportStateCalls={};
  for(const fixture of fixtures){
    const host=document.createElement('div');
    host.dataset.workspaceExportStateFixture=fixture.id;
    document.body.append(host);
    const {bytesBase64,...candidateFields}=fixture.candidate;
    const binary=atob(bytesBase64),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
    const candidate={...candidateFields,bytes} as ExportCandidate;
    const record=(action:string)=>{
      const calls=window.__workspaceExportStateCalls!;
      const key=`${fixture.id}:${action}`;
      calls[key]=(calls[key]??0)+1;
    };
    createRoot(host).render(<WorkspaceExport
      candidate={candidate}
      complianceReport={null}
      complianceRevision={null}
      pending={false}
      error=""
      onPrepare={()=>record('prepare')}
      onDownload={()=>record('download')}
      onDownloadReview={()=>record('review')}
      onDownloadOriginal={()=>record('original')}
      originalAvailable={false}
      onPrev={()=>record('previous')}
      onReviewSource={()=>record('review-source')}
      onEditTarget={()=>record('edit-target')}
    />);
  }
}
