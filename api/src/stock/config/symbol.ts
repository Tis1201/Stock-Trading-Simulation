// Sàn HOSE (Hồ Chí Minh)
export const HOSE_STOCKS = [
  // Top tier stocks
  "VNM.VN", "VCB.VN", "VHM.VN", "VIC.VN", "TCB.VN", "BID.VN", "CTG.VN", "HPG.VN", "MSN.VN", "SAB.VN",
  "GAS.VN", "PLX.VN", "VRE.VN", "MWG.VN", "FPT.VN", "SSI.VN", "VJC.VN", "POW.VN", "STB.VN", "TPB.VN",
  
  // Banking & Financial
  "ACB.VN", "MBB.VN", "HDB.VN", "EIB.VN", "LPB.VN", "VPB.VN", "NVB.VN", "OCB.VN", "SHB.VN", "VIB.VN",
  
  // Real Estate
  "VRG.VN", "DXG.VN", "PDR.VN", "KDH.VN", "DIG.VN", "NVL.VN", "HDG.VN", "NLG.VN", "IJC.VN", "BCM.VN",
  
  // Manufacturing & Industry
  "HSG.VN", "HPX.VN", "NKG.VN", "POM.VN", "SMC.VN", "DPM.VN", "DCM.VN", "GVR.VN", "PVD.VN", "PVS.VN",
  
  // Technology & Telecom
  "CMG.VN", "VGI.VN", "ELC.VN", "ITD.VN", "CMX.VN", "VNT.VN", "SGT.VN", "FOX.VN", "DSN.VN", "MFS.VN",
  
  // Consumer & Retail
  "VGC.VN", "MCH.VN", "CRC.VN", "DGC.VN", "PAN.VN", "QNS.VN", "TNG.VN", "VFG.VN", "KDC.VN", "ANV.VN",
  
  // Energy & Utilities
  "POW.VN", "PGV.VN", "PC1.VN", "REE.VN", "GEG.VN", "SBA.VN", "VNE.VN", "PGD.VN", "NT2.VN", "EVE.VN",
  
  // Healthcare & Pharma
  "DHG.VN", "IMP.VN", "PME.VN", "TRA.VN", "TNH.VN", "DP3.VN", "AMV.VN", "SPM.VN", "DVN.VN", "PPP.VN",
  
  // Agriculture & Food
  "HAG.VN", "LSS.VN", "SBT.VN", "TAC.VN", "LAF.VN", "HNG.VN", "VHC.VN", "BAF.VN", "CAV.VN", "FMC.VN",
  
  // Construction & Materials
  "CTD.VN", "HBC.VN", "FCN.VN", "C32.VN", "CC1.VN", "HU1.VN", "LCG.VN", "TV2.VN", "VCG.VN", "SCR.VN",
  
  // Transportation & Logistics
  "GMD.VN", "HAH.VN", "TMS.VN", "VSC.VN", "MVN.VN", "PVT.VN", "TCO.VN", "VOS.VN", "AST.VN", "SCS.VN",
  
  // Others
  "AGG.VN", "AAA.VN", "ABS.VN", "ACE.VN", "ADS.VN", "AGF.VN", "AGM.VN", "AGR.VN", "APG.VN", "ASM.VN"
];


export const HNX_STOCKS = [
  // Top HNX stocks
  "SHN.VN", "CEO.VN", "MBS.VN", "VND.VN", "TDH.VN", "IDJ.VN", "NRC.VN", "SHS.VN", "PVS.VN", "BVS.VN",
  "VCS.VN", "ART.VN", "BSI.VN", "CTS.VN", "HUT.VN", "IDI.VN", "KLS.VN", "LAS.VN", "MHL.VN", "NBC.VN",
  "NET.VN", "NHH.VN", "PLC.VN", "PVB.VN", "PVI.VN", "SRA.VN", "TIG.VN", "VIG.VN", "VIX.VN", "WCS.VN",
  
  // Banking & Finance HNX
  "BAB.VN", "BIC.VN", "BTS.VN", "CJC.VN", "DSE.VN", "EVS.VN", "FTS.VN", "HBS.VN", "IFS.VN", "ORS.VN",
  
  // Manufacturing HNX
  "DTK.VN", "HJS.VN", "L14.VN", "L35.VN", "L61.VN", "L62.VN", "LDP.VN", "LGC.VN", "LHG.VN", "MDG.VN",
  
  // Real Estate HNX  
  "CEO.VN", "TDH.VN", "IDJ.VN", "NRC.VN", "VND.VN", "IDI.VN", "MHL.VN", "NBC.VN", "NHH.VN", "VIX.VN"
];

// Sàn UPCOM
export const UPCOM_STOCKS = [
  "AAV.VN", "ABC.VN", "ABI.VN", "ABR.VN", "ABT.VN", "ACG.VN", "ACS.VN", "ADP.VN", "AFX.VN", "AGC.VN",
  "AIC.VN", "ALT.VN", "AME.VN", "AMP.VN", "AMS.VN", "APC.VN", "APF.VN", "APH.VN", "API.VN", "APP.VN",
  "APS.VN", "ARM.VN", "ART.VN", "ASA.VN", "ASG.VN", "ATG.VN", "ATS.VN", "AVC.VN", "B82.VN", "BBC.VN",
  "BCC.VN", "BCI.VN", "BFC.VN", "BHK.VN", "BHN.VN", "BII.VN", "BKG.VN", "BMC.VN", "BMF.VN", "BMJ.VN",
  "BMP.VN", "BRC.VN", "BRS.VN", "BSC.VN", "BST.VN", "BTC.VN", "BTW.VN", "BVG.VN", "BVN.VN", "BWE.VN"
];

// Tất cả mã chứng khoán VN
export const ALL_VN_STOCKS = [...HOSE_STOCKS, ...HNX_STOCKS, ...UPCOM_STOCKS];

// Top stocks được giao dịch nhiều
export const TOP_VN_STOCKS = [
  "VNM.VN", "VCB.VN", "VHM.VN", "VIC.VN", "TCB.VN", "BID.VN", "CTG.VN", "HPG.VN", "MSN.VN", "SAB.VN",
  "GAS.VN", "PLX.VN", "VRE.VN", "MWG.VN", "FPT.VN", "SSI.VN", "VJC.VN", "POW.VN", "STB.VN", "TPB.VN"
];