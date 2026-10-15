from django.urls import path

from . import views

urlpatterns = [
    path("health", views.health, name="health"),
    path("predict", views.predict, name="predict"),
    path("predict-tmt", views.predict_tmt, name="predict_tmt"),
    path("explain", views.explain, name="explain"),
]
