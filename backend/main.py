import logging
from datetime import datetime
from typing import Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from models import (
    PasteDataRequest,
    LoadPasteRequest,
    UpdateBatteryRequest,
    BusConfigurationRequest,
    ReconstructTableRequest,
    AnalyzeRequest,
    MoveLoadsRequest
)
from analysis import (
    analyze_lines,
    analyze_generators,
    analyze_buses,
    analyze_loads,
    analyze_all,
    update_battery_capacity,
    apply_load_moves,
    reset_load_moves,
    bus_config_manager,
    load_store
)
from parsing import reconstruct_table
from report import generate_pdf_report

app = FastAPI(title="PowerWorld Simulation Analyzer")

# CORS - allow all origins (API is proxied through Next.js in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)


@app.get("/")
async def read_root():
    return {"message": "PowerWorld Simulation Analyzer API", "status": "running"}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/analyze")
async def analyze(request: AnalyzeRequest):
    return analyze_all(
        request.lines_data,
        request.generators_data,
        request.buses_data,
        request.loads_mw_data,
        request.loads_mvar_data
    )


@app.post("/api/analyze/lines")
async def analyze_lines_endpoint(request: PasteDataRequest):
    try:
        return analyze_lines(request.data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logging.error(f"Error processing lines data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing lines data: {str(e)}")


@app.post("/api/analyze/generators")
async def analyze_generators_endpoint(request: PasteDataRequest):
    try:
        return analyze_generators(request.data, load_store.current_load_cost_eur)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logging.error(f"Error processing generators data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing generators data: {str(e)}")


@app.post("/api/analyze/buses")
async def analyze_buses_endpoint(request: PasteDataRequest):
    try:
        return analyze_buses(request.data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logging.error(f"Error processing buses data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing buses data: {str(e)}")


@app.post("/api/analyze/loads")
async def analyze_loads_endpoint(request: LoadPasteRequest):
    load_type = request.load_type.lower()
    if load_type not in ["mw", "mvar"]:
        raise HTTPException(status_code=400, detail="load_type must be 'mw' or 'mvar'")

    try:
        if load_type == "mw":
            return analyze_loads(request.data, None)
        else:
            return analyze_loads(None, request.data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logging.error(f"Error processing loads data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing loads data: {str(e)}")


@app.post("/api/analyze/generators/update-battery")
async def update_battery_endpoint(request: UpdateBatteryRequest):
    try:
        if not request.battery_table_data:
            raise HTTPException(status_code=400, detail="No battery table data provided")
        return update_battery_capacity(request.battery_table_data, request.datetime)
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating battery capacity: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error updating battery capacity: {str(e)}")


@app.post("/api/analyze/generators/reconstruct")
async def reconstruct_table_endpoint(request: ReconstructTableRequest):
    try:
        data = reconstruct_table(
            request.battery_table_data,
            request.original_data,
            request.original_columns
        )
        return {"data": data}
    except Exception as e:
        logging.error(f"Error reconstructing table: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error reconstructing table: {str(e)}")


@app.post("/api/loads/move")
async def move_loads_endpoint(request: MoveLoadsRequest):
    try:
        result = apply_load_moves([op.dict() for op in request.operations])
        return result
    except Exception as e:
        logging.error(f"Error applying load moves: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error applying load moves: {str(e)}")


@app.post("/api/loads/reset")
async def reset_loads_endpoint():
    try:
        result = reset_load_moves()
        return result
    except Exception as e:
        logging.error(f"Error resetting load moves: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error resetting load moves: {str(e)}")


@app.post("/api/generate-report")
async def generate_report(request: Dict[str, Any]):
    try:
        buffer = generate_pdf_report(request)
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=powerworld_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
            }
        )
    except Exception as e:
        logging.error(f"Error generating report: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generating report: {str(e)}")


@app.get("/api/bus-config")
async def get_bus_config():
    configs = bus_config_manager.get_all()
    return {"buses": [config.dict() for config in configs]}


@app.post("/api/bus-config")
async def set_bus_config(request: BusConfigurationRequest):
    bus_config_manager.set_all(request.buses)
    configs = bus_config_manager.get_all()
    return {"message": "Bus configuration updated", "buses": [config.dict() for config in configs]}


if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
        access_log=True
    )
