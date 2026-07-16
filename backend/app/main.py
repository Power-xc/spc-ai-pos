"""FastAPI application entrypoint."""

from contextlib import asynccontextmanager
import logging

import redis.asyncio as redis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents.order_agent import OrderAgent
from app.agents.production_agent import ProductionAgent
from app.agents.sales_agent import SalesAnalysisAgent
from app.config import get_settings
from app.database import (
    build_file_session_factory,
    close_engine,
    get_session_factory,
    init_engine,
)
from app.db.session import check_database_connectivity, is_postgres_mode
from app.orchestration.intent import IntentClassifier
from app.orchestration.router import AgentRouter
from app.routers import (
    actions_todo,
    analytics,
    chat,
    dashboard,
    modal,
    notifications,
    notification_settings,
    orders,
    production,
    promotions,
    sales,
    support,
)
from app.schemas.common import APIResponse
from app.security.audit import AuditLogger
from app.security.masking import DataMaskingService
from app.services.alert_service import AlertService
from app.services.actions_todo_service import ActionsTodoService
from app.services.chat_service import ChatService
from app.services.dashboard_service import DashboardService
from app.services.llm_gateway import LLMGateway
from app.services.notification import NotificationService
from app.services.order_service import OrderService
from app.services.scheduler import setup_scheduler
from app.tools.chance_loss import ChanceLossCalculator
from app.tools.prediction import InventoryPredictor
from app.tools.templates import TemplateEngine

settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize shared resources on startup and dispose them on shutdown."""

    init_engine()
    if is_postgres_mode():
        # Fail fast in PostgreSQL mode so broken DB wiring is caught at startup, not on first write.
        connected = await check_database_connectivity()
        if not connected:
            raise RuntimeError("PostgreSQL startup connectivity check failed")
        logger.info("PostgreSQL mode enabled and connectivity verified")

    db_session_factory = get_session_factory()
    analytics_session_factory = (
        build_file_session_factory(settings.data_dir)
        if is_postgres_mode()
        else db_session_factory
    )

    redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    notification_service = NotificationService(redis_client=redis_client)
    alert_service = AlertService(
        session_factory=db_session_factory,
        notification_service=notification_service,
    )
    actions_todo_service = ActionsTodoService(session_factory=db_session_factory)
    order_service = OrderService(session_factory=db_session_factory)
    dashboard_service = DashboardService(session_factory=db_session_factory)
    chat_service = ChatService(session_factory=db_session_factory)
    audit_logger = AuditLogger(log_path=settings.audit_log_path)
    masking_service = DataMaskingService()
    llm_gateway = LLMGateway(
        api_key=settings.openai_api_key,
        default_model=settings.openai_model,
        complex_model=settings.openai_complex_model,
        base_url=settings.openai_base_url,
    )
    predictor = InventoryPredictor()
    chance_loss_calculator = ChanceLossCalculator()
    template_engine = TemplateEngine()
    intent_classifier = IntentClassifier(llm_gateway=llm_gateway)

    production_agent = ProductionAgent(
        db_session_factory=db_session_factory,
        predictor=predictor,
        chance_loss_calculator=chance_loss_calculator,
        template_engine=template_engine,
        notification_service=notification_service,
        audit_logger=audit_logger,
    )
    order_agent = OrderAgent(
        db_session_factory=db_session_factory,
        template_engine=template_engine,
        llm_gateway=llm_gateway,
        notification_service=notification_service,
        audit_logger=audit_logger,
    )
    sales_agent = SalesAnalysisAgent(
        db_session_factory=db_session_factory,
        intent_classifier=intent_classifier,
        llm_gateway=llm_gateway,
        masking_service=masking_service,
        audit_logger=audit_logger,
    )
    agent_router = AgentRouter(
        production_agent=production_agent,
        order_agent=order_agent,
        sales_agent=sales_agent,
        intent_classifier=intent_classifier,
        audit_logger=audit_logger,
        actions_todo_service=actions_todo_service,
        dashboard_service=dashboard_service,
    )
    scheduler = setup_scheduler(
        production_agent=production_agent,
        order_agent=order_agent,
        notification_service=notification_service,
        db_session_factory=db_session_factory,
    )

    app.state.db_session_factory = db_session_factory
    app.state.analytics_session_factory = analytics_session_factory
    app.state.redis = redis_client
    app.state.notification_service = notification_service
    app.state.alert_service = alert_service
    app.state.actions_todo_service = actions_todo_service
    app.state.order_service = order_service
    app.state.dashboard_service = dashboard_service
    app.state.chat_service = chat_service
    app.state.audit_logger = audit_logger
    app.state.masking_service = masking_service
    app.state.llm_gateway = llm_gateway
    app.state.predictor = predictor
    app.state.chance_loss_calculator = chance_loss_calculator
    app.state.template_engine = template_engine
    app.state.intent_classifier = intent_classifier
    app.state.production_agent = production_agent
    app.state.order_agent = order_agent
    app.state.sales_agent = sales_agent
    app.state.agent_router = agent_router
    app.state.scheduler = scheduler

    scheduler.start()
    try:
        yield
    finally:
        if scheduler.running:
            scheduler.shutdown(wait=False)
        await llm_gateway.close()
        if hasattr(redis_client, "aclose"):
            await redis_client.aclose()
        else:  # pragma: no cover
            await redis_client.close()
        await close_engine()


app = FastAPI(
    title="Dunkin AI Agent Backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router)
app.include_router(actions_todo.router)
app.include_router(production.router)
app.include_router(orders.router)
app.include_router(promotions.router)
app.include_router(sales.router)
app.include_router(analytics.router)
app.include_router(chat.router)
app.include_router(notifications.router)
app.include_router(notification_settings.router)
app.include_router(support.router)
app.include_router(modal.router)
app.add_api_route(
    "/api/order/confirm",
    orders.confirm_order,
    methods=["POST"],
    response_model=APIResponse,
)
app.add_api_route(
    "/api/order/recommendations",
    orders.get_order_recommendations_legacy,
    methods=["GET"],
    response_model=APIResponse,
)
app.add_api_route(
    "/api/order/deadlines",
    orders.get_order_deadlines_legacy,
    methods=["GET"],
    response_model=APIResponse,
)
app.add_api_route(
    "/api/home/briefing",
    dashboard.get_home_briefing,
    methods=["GET"],
    response_model=APIResponse,
)
app.add_api_route(
    "/api/home/alerts",
    dashboard.get_home_alerts,
    methods=["GET"],
    response_model=APIResponse,
)
app.add_api_route(
    "/api/home/sales-summary",
    dashboard.get_home_sales_summary,
    methods=["GET"],
    response_model=APIResponse,
)
app.add_api_route(
    "/api/inventory/current",
    production.get_inventory_current_legacy,
    methods=["GET"],
    response_model=APIResponse,
)
app.add_api_route("/api/chat", chat.chat_legacy, methods=["POST"])
app.add_api_route(
    "/api/notifications/stream",
    notifications.notification_stream_legacy,
    methods=["GET"],
)


@app.get("/")
async def root() -> dict[str, str]:
    """Service root endpoint."""

    return {"service": "dunkin-ai-agent", "status": "running"}


@app.get("/health")
async def health() -> dict:
    """Basic health-check endpoint."""

    return {
        "status": "ok",
        "environment": settings.app_env,
        "data_mode": settings.data_mode,
        "llm_usage": app.state.llm_gateway.get_usage_stats(),
    }
